const jiraService = require('../services/jiraService');
const jwt = require('jsonwebtoken');
const JiraIntegration = require('../models/JiraIntegration');
const db = require('../config/database');
const { encrypt, decrypt } = require('../utils/encryption');
const cacheService = require('../services/cacheService');

const processedStates = new Set(); // In-memory deduplication

const jiraController = {
  // 1. Redirect User to Jira
  auth: async (req, res) => {
    // Allow passing userId in query for testing (e.g. ?userId=3)
    let userId = req.query.userId || 1;

    // If a token is provided (from frontend redirect), decode it to get the real userId
    if (req.query.token) {
      try {
        const decoded = jwt.verify(req.query.token, process.env.JWT_SECRET);
        if (decoded && decoded.id) userId = decoded.id;
      } catch (err) {
        console.error('Invalid token provided to Jira auth:', err.message);
      }
    }

    // Security: Sign the state
    const state = jwt.sign({ id: userId, provider: 'jira' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    
    // Deduplication: Store pending state in UserIntegration (generic table)
    await db.UserIntegration.upsert({
      userId: Number(userId),
      provider: 'jira_pending',
      accessToken: encrypt(state)
    });

    const url = jiraService.getAuthorizationUrl(state);
    res.redirect(url);
  },

  // 2. Callback: Handle return from Jira
  callback: async (req, res) => {
    // Prevent browser caching
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    const { code, state } = req.query;
    
    // Robust URL resolution
    let frontendUrl = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.trim() : '';
    if (!frontendUrl) {
      frontendUrl = process.env.NODE_ENV === 'production' ? 'https://www.razoncomfort.com' : 'http://localhost:5173';
    }
    frontendUrl = frontendUrl.replace(/\/$/, '');

    // In-Memory Deduplication
    if (state && processedStates.has(state)) {
      console.log(`[Jira Callback] ⚡ Fast dedup: State ${state} already processed.`);
      return res.redirect(`${frontendUrl}/employee?integration_success=jira&cached=true`);
    }

    // Security: Verify state
    let userId;
    try {
      const decoded = jwt.verify(state, process.env.JWT_SECRET);
      userId = decoded.id;
    } catch (err) {
      return res.redirect(`${frontendUrl}/employee?integration_error=jira_csrf_error`);
    }

    // Add to processed states AFTER verification
    if (state) {
      processedStates.add(state);
      setTimeout(() => processedStates.delete(state), 5 * 60 * 1000);
    }

    // Deduplication: Check for pending state
    const pending = await db.UserIntegration.findOne({ where: { userId, provider: 'jira_pending' } });
    
    if (!pending) {
      // No pending record? Check if already connected
      const existing = await JiraIntegration.findOne({ where: { userId } });
      if (existing) {
        console.log(`[Jira Callback] ⚠️ Duplicate callback detected (No pending state). User ${userId} already connected.`);
        return res.redirect(`${frontendUrl}/employee?integration_success=jira&dedup=db`);
      }
      console.error('[Jira Callback] ❌ Session expired or invalid state.');
      return res.redirect(`${frontendUrl}/employee?integration_error=jira_session_expired`);
    }

    // Verify state matches
    if (decrypt(pending.accessToken) !== state) {
      console.error('[Jira Callback] ❌ State mismatch.');
      return res.redirect(`${frontendUrl}/employee?integration_error=jira_csrf_error`);
    }

    if (!code) return res.status(400).send('No code provided');

    try {
      await jiraService.exchangeCodeForToken(code, userId);
      
      // Cleanup: Remove pending state
      await pending.destroy();
      
      console.log(`\n[Jira Verify] 🔗 Connection successful for User ${userId}.`);

      // Trigger sync in background AFTER response
      setImmediate(() => {
        console.log(`[Jira Verify] 🚀 Triggering background sync...`);
        jiraService.syncJiraData(userId)
          .then(() => {
            console.log(`[Jira Verify] ✨ Sync verification complete.`);
          })
          .catch(err => console.error(`[Jira Verify] ❌ Sync verification failed:`, err.message));
      });

      // Redirect back to the frontend app
      return res.redirect(`${frontendUrl}/employee?integration_success=jira`);
    } catch (error) {
      // Handle duplicate callback requests (Browser retries)
      if (error.response && error.response.data && error.response.data.error === 'invalid_grant') {
        const existing = await JiraIntegration.findOne({ where: { userId } });
        if (existing) {
          console.log(`[Jira Callback] ⚠️ Duplicate callback detected for User ${userId}. Integration already exists. Ignoring error.`);
          return res.redirect(`${frontendUrl}/employee?integration_success=jira&dedup=error`);
        }
      }
      
      return res.redirect(`${frontendUrl}/employee?integration_error=jira_failed`);
    }
  },

  // 3. Trigger Sync Manually
  sync: async (req, res) => {
    try {
      // req.user comes from authenticateToken middleware
      const userId = req.user ? req.user.id : 1; 
      const result = await jiraService.syncJiraData(userId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 4. Get Data for Python Analysis
  getAnalysisData: async (req, res) => {
    try {
      const userId = req.user ? req.user.id : 1;
      const cacheKey = `jira:analysis:${userId}`;
      
      const cached = cacheService.get(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      const data = await jiraService.getDataForAnalysis(userId);
      const response = {
        source: 'jira',
        count: data.length,
        data: data
      };
      cacheService.set(cacheKey, response, 600); // Cache for 10 minutes
      res.json(response);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 5. Get Status
  getStatus: async (req, res) => {
    try {
      const userId = req.user.id;
      const integration = await JiraIntegration.findOne({ where: { userId } });
      res.json({ connected: !!integration, lastSyncedAt: integration?.lastSyncedAt });
    } catch (error) { res.status(500).json({ error: error.message }); }
  },

  // 6. Disconnect
  disconnect: async (req, res) => {
    try {
      const userId = req.user.id;
      await JiraIntegration.destroy({ where: { userId } });
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  }
};

module.exports = jiraController;