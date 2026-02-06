const slackService = require('../services/slackService');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { encrypt, decrypt } = require('../utils/encryption');

const processedStates = new Set(); // In-memory deduplication

const slackController = {
  // 1. Redirect User to Slack
  auth: async (req, res) => {
    console.log('[Slack Auth] 🚀 Starting auth flow...');
    let userId = req.query.userId || 1;

    if (req.query.token) {
      try {
        const decoded = jwt.verify(req.query.token, process.env.JWT_SECRET);
        if (decoded && decoded.id) {
          userId = decoded.id;
          console.log(`[Slack Auth] ✅ Verified user from token: ID ${userId}`);
        }
      } catch (err) {
        console.error('[Slack Auth] ❌ Invalid token provided:', err.message);
      }
    }

    // Security: Sign the state
    const state = jwt.sign({ id: userId, provider: 'slack' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    
    // Deduplication: Store pending state
    await db.UserIntegration.upsert({
      userId: Number(userId),
      provider: 'slack_pending',
      accessToken: encrypt(state)
    });

    const url = slackService.getAuthorizationUrl(state);
    res.redirect(url);
  },

  // 2. Callback: Handle return from Slack
  callback: async (req, res) => {
    // Prevent browser caching
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    console.log('[Slack Callback] 📥 Received callback from Slack.');
    const { code, state, error } = req.query;
    let frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    if (process.env.NODE_ENV === 'production') {
      frontendUrl = process.env.FRONTEND_URL || 'https://www.razoncomfort.com';
    }
    frontendUrl = frontendUrl.replace(/\/$/, '');

    // In-Memory Deduplication
    if (state && processedStates.has(state)) {
      console.log(`[Slack Callback] ⚡ Fast dedup: State ${state} already processed.`);
      return res.redirect(`${frontendUrl}/employee?integration_success=slack&cached=true`);
    }
    if (state) {
      processedStates.add(state);
      setTimeout(() => processedStates.delete(state), 5 * 60 * 1000);
    }

    // Security: Verify state
    let userId;
    try {
      const decoded = jwt.verify(state, process.env.JWT_SECRET);
      userId = decoded.id;
    } catch (err) {
      return res.redirect(`${frontendUrl}/employee?integration_error=slack_csrf_error`);
    }

    // Deduplication: Check for pending state
    const pending = await db.UserIntegration.findOne({ where: { userId, provider: 'slack_pending' } });
    
    if (!pending) {
      // No pending record? Check if already connected
      const existing = await db.UserIntegration.findOne({ where: { userId, provider: 'slack' } });
      if (existing) {
        console.log(`[Slack Callback] ⚠️ Duplicate callback detected (No pending state). User ${userId} already connected.`);
        return res.redirect(`${frontendUrl}/employee?integration_success=slack&dedup=db`);
      }
      console.error('[Slack Callback] ❌ Session expired or invalid state.');
      return res.redirect(`${frontendUrl}/employee?integration_error=slack_session_expired`);
    }

    // Verify state matches
    if (decrypt(pending.accessToken) !== state) {
      console.error('[Slack Callback] ❌ State mismatch.');
      return res.redirect(`${frontendUrl}/employee?integration_error=slack_csrf_error`);
    }

    if (error) {
      console.error(`[Slack Callback] ❌ Slack returned error: ${error}`);
      return res.redirect(`${frontendUrl}/employee?integration_error=slack_${error}`);
    }

    try {
      await slackService.exchangeCodeForToken(code, userId);
      
      // Cleanup: Remove pending state
      await pending.destroy();
      
      console.log(`[Slack Verify] 🔗 Connection successful for User ${userId}.`);

      // Redirect FIRST to prevent timeout/duplicate requests
      return res.redirect(`${frontendUrl}/employee?integration_success=slack`);

      // Trigger sync in background AFTER response is sent
      setImmediate(() => {
        console.log(`[Slack Verify] 🚀 Triggering background sync...`);
        slackService.syncSlackData(userId)
          .then((count) => console.log(`[Slack Verify] ✨ Initial sync complete. Processed ${count} messages.`))
          .catch(err => console.error(`[Slack Verify] ❌ Initial sync failed:`, err.message));
      });
    } catch (error) {
      console.error('[Slack Callback] ❌ Error during token exchange:', error.message);

      // Handle duplicate callback requests (Browser retries)
      if (error.message && (error.message.includes('invalid_code') || error.message === 'Failed to connect to Slack')) {
        const existing = await db.UserIntegration.findOne({ where: { userId, provider: 'slack' } });
        if (existing) {
          console.log(`[Slack Callback] ⚠️ Duplicate callback detected for User ${userId}. Integration already exists. Ignoring error.`);
          return res.redirect(`${frontendUrl}/employee?integration_success=slack&dedup=error`);
        }
      }

      // Log details for unexpected errors
      if (error.response) {
        console.error('[Slack Callback] API Response:', JSON.stringify(error.response.data, null, 2));
      }
      return res.redirect(`${frontendUrl}/employee?integration_error=slack_failed`);
    }
  },

  // 3. Manual Sync
  sync: async (req, res) => {
    try {
      const userId = req.user.id;
      const count = await slackService.syncSlackData(userId);
      res.json({ success: true, count });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 4. Get Status
  getStatus: async (req, res) => {
    try {
      const userId = req.user.id;
      const integration = await db.UserIntegration.findOne({ where: { userId, provider: 'slack' } });
      res.json({ connected: !!integration, lastSyncedAt: integration?.lastSyncedAt });
    } catch (error) { res.status(500).json({ error: error.message }); }
  },

  // 5. Disconnect
  disconnect: async (req, res) => {
    try {
      const userId = req.user.id;
      await db.UserIntegration.destroy({ where: { userId, provider: 'slack' } });
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
  }
};

module.exports = slackController;