const slackService = require('../services/slackService');
const jwt = require('jsonwebtoken');

const slackController = {
  // 1. Redirect User to Slack
  auth: (req, res) => {
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
    const url = slackService.getAuthorizationUrl(state);
    res.redirect(url);
  },

  // 2. Callback: Handle return from Slack
  callback: async (req, res) => {
    console.log('[Slack Callback] 📥 Received callback from Slack.');
    const { code, state, error } = req.query;
    let frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    frontendUrl = frontendUrl.replace(/\/$/, '');

    // Security: Verify state
    let userId;
    try {
      const decoded = jwt.verify(state, process.env.JWT_SECRET);
      userId = decoded.id;
    } catch (err) {
      return res.redirect(`${frontendUrl}/settings?integration_error=slack_csrf_error`);
    }

    if (error) {
      console.error(`[Slack Callback] ❌ Slack returned error: ${error}`);
      return res.redirect(`${frontendUrl}/settings?integration_error=slack_${error}`);
    }

    try {
      await slackService.exchangeCodeForToken(code, userId);
      
      console.log(`[Slack Verify] 🔗 Connection successful for User ${userId}.`);
      console.log(`[Slack Verify] 🚀 Triggering immediate sync...`);
      slackService.syncSlackData(userId)
        .then((count) => console.log(`[Slack Verify] ✨ Initial sync complete. Processed ${count} messages.`))
        .catch(err => console.error(`[Slack Verify] ❌ Initial sync failed:`, err.message));

      res.redirect(`${frontendUrl}/settings?integration_success=slack`);
    } catch (error) {
      console.error('[Slack Callback] ❌ Error during token exchange:', error.message);
      
      // Only log details if it's an unexpected API error (not our own "Failed to connect" wrapper)
      if (error.message !== 'Failed to connect to Slack') {
        if (error.response) {
          console.error('[Slack Callback] API Response:', JSON.stringify(error.response.data, null, 2));
        } else {
          console.error('[Slack Callback] Error Details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
        }
      }
      res.redirect(`${frontendUrl}/settings?integration_error=slack_failed`);
    }
  },

  // 3. Manual Sync
  sync: async (req, res) => {
    // Implementation for manual sync trigger if needed
  }
};

module.exports = slackController;