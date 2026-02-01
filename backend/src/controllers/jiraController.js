const jiraService = require('../services/jiraService');

const jiraController = {
  // 1. Redirect User to Jira
  auth: (req, res) => {
    const url = jiraService.getAuthorizationUrl();
    res.redirect(url);
  },

  // 2. Callback: Handle return from Jira
  callback: async (req, res) => {
    const { code } = req.query;
    // In a real app, you'd get userId from session/cookie. 
    // For this MVP, we might default to ID 1 or pass it in state.
    // Assuming a default user ID of 1 for the pilot if not authenticated in this specific request context
    const userId = 1; 

    if (!code) return res.status(400).send('No code provided');

    try {
      await jiraService.exchangeCodeForToken(code, userId);
      // Return simple HTML success page instead of redirecting to frontend (which might be offline)
      res.send(`
        <div style="font-family:sans-serif;text-align:center;padding:50px;">
          <h1 style="color:green;">Jira Connected Successfully! ✅</h1>
          <p>You can now close this window and run the sync command in your terminal.</p>
        </div>
      `);
    } catch (error) {
      res.status(500).send('Jira connection failed');
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