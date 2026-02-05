const jiraService = require('../services/jiraService');
const jwt = require('jsonwebtoken');

const jiraController = {
  // 1. Redirect User to Jira
  auth: (req, res) => {
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
    const url = jiraService.getAuthorizationUrl(state);
    res.redirect(url);
  },

  // 2. Callback: Handle return from Jira
  callback: async (req, res) => {
    const { code, state } = req.query;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    // Security: Verify state
    let userId;
    try {
      const decoded = jwt.verify(state, process.env.JWT_SECRET);
      userId = decoded.id;
    } catch (err) {
      return res.redirect(`${frontendUrl}/settings?integration_error=jira_csrf_error`);
    }

    if (!code) return res.status(400).send('No code provided');

    try {
      await jiraService.exchangeCodeForToken(code, userId);
      
      console.log(`\n[Jira Verify] 🔗 Connection successful for User ${userId}.`);
      console.log(`[Jira Verify] 🚀 Triggering immediate sync to verify data flow...`);
      
      // Trigger sync in background to verify fetching and storage
      jiraService.syncJiraData(userId)
        .then(() => {
          console.log(`[Jira Verify] ✨ Sync verification complete. Check database for new records.`);
          console.log(`[Jira Verify] 🗑️  To clean up test data (SQL): DELETE FROM "JiraIssues" WHERE "integrationId" IN (SELECT id FROM "JiraIntegrations" WHERE "userId"=${userId});`);
        })
        .catch(err => console.error(`[Jira Verify] ❌ Sync verification failed:`, err.message));

      // Redirect back to the frontend app
      res.redirect(`${frontendUrl}/settings?integration_success=jira`);
    } catch (error) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      res.redirect(`${frontendUrl}/settings?integration_error=jira_failed`);
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
      const data = await jiraService.getDataForAnalysis(userId);
      res.json({
        source: 'jira',
        count: data.length,
        data: data
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = jiraController;