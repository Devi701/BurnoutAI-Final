const googleCalendarService = require('../services/googleCalendar');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

const googleCalendarController = {
  // 1. Redirect User to Google
  auth: (req, res) => {
    console.log('[Google Auth] 🚀 Starting auth flow...');
    // Allow passing userId in query for testing (e.g. ?userId=3)
    let userId = req.query.userId || 1;

    // If a token is provided (from frontend redirect), decode it to get the real userId
    if (req.query.token) {
      try {
        const decoded = jwt.verify(req.query.token, process.env.JWT_SECRET);
        if (decoded && decoded.id) {
          userId = decoded.id;
          console.log(`[Google Auth] ✅ Verified user from token: ID ${userId}`);
        }
      } catch (err) {
        console.error('[Google Auth] ❌ Invalid token provided:', err.message);
      }
    }

    try {
      // Security: Sign the state to prevent CSRF
      const state = jwt.sign({ id: userId, provider: 'google' }, process.env.JWT_SECRET, { expiresIn: '1h' });
      
      console.log(`[Google Auth] 🔗 Redirecting User ${userId} to Google consent screen...`);
      const url = googleCalendarService.getAuthorizationUrl(state);
      res.redirect(url);
    } catch (error) {
      console.error('[Google Auth] ❌ Failed to generate auth URL:', error);
      res.status(500).send('Authentication configuration error. Check server logs.');
    }
  },

  // 2. Callback: Handle return from Google
  callback: async (req, res) => {
    console.log('[Google Callback] 📥 Received callback from Google.');
    const { code, state, error } = req.query;
    let frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    frontendUrl = frontendUrl.replace(/\/$/, ''); // Remove trailing slash if present

    // Security: Verify the state parameter
    let userId;
    try {
      if (!state) throw new Error('Missing state parameter');
      const decoded = jwt.verify(state, process.env.JWT_SECRET);
      if (decoded.provider !== 'google') throw new Error('Invalid state provider');
      userId = decoded.id;
    } catch (err) {
      console.error(`[Google Callback] ❌ Security Error: Invalid state parameter (${err.message})`);
      return res.redirect(`${frontendUrl}/settings?integration_error=google_csrf_error`);
    }

    if (error) {
      console.error(`[Google Callback] ❌ Google returned error: ${error}`);
      return res.redirect(`${frontendUrl}/settings?integration_error=google_${error}`);
    }

    if (!code) {
      console.error('[Google Callback] ❌ Missing "code" parameter.');
      return res.redirect(`${frontendUrl}/settings?integration_error=google_no_code`);
    }

    try {
      await googleCalendarService.exchangeCodeForToken(code, userId);
      
      console.log(`\n[Google Verify] 🔗 Connection successful for User ${userId}.`);
      console.log(`[Google Verify] 🚀 Triggering immediate sync...`);
      
      // Trigger sync in background
      googleCalendarService.syncUserCalendar(userId)
        .then((count) => console.log(`[Google Verify] ✨ Initial sync complete. Processed ${count} events.`))
        .catch(err => console.error(`[Google Verify] ❌ Initial sync failed:`, err.message));

      console.log(`[Google Callback] ✅ Redirecting to frontend: ${frontendUrl}/settings?integration_success=google`);
      res.redirect(`${frontendUrl}/settings?integration_success=google`);
    } catch (error) {
      console.error('[Google Callback] ❌ Error during token exchange:', error.response ? error.response.data : error.message);
      
      // Handle duplicate callback requests (Browser retries)
      if (error.response && error.response.data && error.response.data.error === 'invalid_grant') {
        const existing = await db.UserIntegration.findOne({ where: { userId, provider: 'google' } });
        if (existing) {
          console.log(`[Google Callback] ⚠️ Duplicate callback detected for User ${userId}. Integration already exists. Ignoring error.`);
          return res.redirect(`${frontendUrl}/settings?integration_success=google`);
        }
      }

      res.redirect(`${frontendUrl}/settings?integration_error=google_failed`);
    }
  },

  // 3. Manual Sync Trigger
  sync: async (req, res) => {
    const userId = req.user ? req.user.id : 1;
    console.log(`[Google Sync] 🔄 Manual sync requested for User ${userId}`);
    try {
      const count = await googleCalendarService.syncUserCalendar(userId);
      console.log(`[Google Sync] ✅ Manual sync successful. Events: ${count}`);
      res.json({ status: 'success', count });
    } catch (error) {
      console.error(`[Google Sync] ❌ Manual sync failed for User ${userId}:`, error.message);
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = googleCalendarController;