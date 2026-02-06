const googleCalendarService = require('../services/googleCalendar');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { encrypt, decrypt } = require('../utils/encryption');

const processedStates = new Set(); // In-memory deduplication

const googleCalendarController = {
  // 1. Redirect User to Google
  auth: async (req, res) => {
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
      
      // Deduplication: Store pending state in DB
      await db.UserIntegration.upsert({
        userId: Number(userId),
        provider: 'google_pending',
        accessToken: encrypt(state) // Store state temporarily
      });
      
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
    // Prevent browser caching of the callback response
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    console.log('[Google Callback] 📥 Received callback from Google.');
    const { code, state, error } = req.query;
    let frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    if (process.env.NODE_ENV === 'production') {
      frontendUrl = process.env.FRONTEND_URL || 'https://www.razoncomfort.com';
    }
    frontendUrl = frontendUrl.replace(/\/$/, ''); // Remove trailing slash if present

    // In-Memory Deduplication (Fastest check)
    if (state && processedStates.has(state)) {
      console.log(`[Google Callback] ⚡ Fast dedup: State ${state} already processed.`);
      return res.redirect(`${frontendUrl}/employee?integration_success=google&cached=true`);
    }
    if (state) {
      processedStates.add(state);
      // Clear from memory after 5 minutes
      setTimeout(() => processedStates.delete(state), 5 * 60 * 1000);
    }

    // Security: Verify the state parameter
    let userId;
    try {
      if (!state) throw new Error('Missing state parameter');
      const decoded = jwt.verify(state, process.env.JWT_SECRET);
      if (decoded.provider !== 'google') throw new Error('Invalid state provider');
      userId = decoded.id;
    } catch (err) {
      console.error(`[Google Callback] ❌ Security Error: Invalid state parameter (${err.message})`);
      return res.redirect(`${frontendUrl}/employee?integration_error=google_csrf_error`);
    }

    // Deduplication: Check for pending state
    const pending = await db.UserIntegration.findOne({ where: { userId, provider: 'google_pending' } });
    
    if (!pending) {
      // No pending record? Check if already connected (Duplicate Callback)
      const existing = await db.UserIntegration.findOne({ where: { userId, provider: 'google' } });
      if (existing) {
        console.log(`[Google Callback] ⚠️ Duplicate callback detected (No pending state). User ${userId} already connected.`);
        return res.redirect(`${frontendUrl}/employee?integration_success=google&dedup=db`);
      }
      console.error('[Google Callback] ❌ Session expired or invalid state (No pending record).');
      return res.redirect(`${frontendUrl}/employee?integration_error=google_session_expired`);
    }

    // Verify state matches stored pending state
    if (decrypt(pending.accessToken) !== state) {
      console.error('[Google Callback] ❌ State mismatch.');
      return res.redirect(`${frontendUrl}/employee?integration_error=google_csrf_error`);
    }

    if (error) {
      console.error(`[Google Callback] ❌ Google returned error: ${error}`);
      return res.redirect(`${frontendUrl}/employee?integration_error=google_${error}`);
    }

    if (!code) {
      console.error('[Google Callback] ❌ Missing "code" parameter.');
      return res.redirect(`${frontendUrl}/employee?integration_error=google_no_code`);
    }

    try {
      await googleCalendarService.exchangeCodeForToken(code, userId);
      
      // Cleanup: Remove pending state
      await pending.destroy();
      
      console.log(`\n[Google Verify] 🔗 Connection successful for User ${userId}.`);

      console.log(`[Google Callback] ✅ Redirecting to frontend: ${frontendUrl}/employee?integration_success=google`);
      return res.redirect(`${frontendUrl}/employee?integration_success=google`);

      // Trigger sync in background AFTER response
      setImmediate(() => {
        console.log(`[Google Verify] 🚀 Triggering background sync...`);
        googleCalendarService.syncUserCalendar(userId)
          .then((count) => console.log(`[Google Verify] ✨ Initial sync complete. Processed ${count} events.`))
          .catch(err => console.error(`[Google Verify] ❌ Initial sync failed:`, err.message));
      });
    } catch (error) {
      console.error('[Google Callback] ❌ Error during token exchange:', error.response ? error.response.data : error.message);
      
      // Handle "invalid_grant" (Code reused/expired) gracefully
      if (error.response && error.response.data && error.response.data.error === 'invalid_grant') {
        const existing = await db.UserIntegration.findOne({ where: { userId, provider: 'google' } });
        if (existing) {
           console.log(`[Google Callback] ⚠️ Invalid Grant (likely duplicate). User ${userId} already connected.`);
           return res.redirect(`${frontendUrl}/employee?integration_success=google&dedup=error`);
        }
      }
      return res.redirect(`${frontendUrl}/employee?integration_error=google_failed`);
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
  },

  // 4. Get Status
  getStatus: async (req, res) => {
    try {
      const userId = req.user.id;
      const integration = await db.UserIntegration.findOne({ where: { userId, provider: 'google' } });
      res.json({ 
        connected: !!integration, 
        lastSyncedAt: integration ? integration.lastSyncedAt : null 
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 5. Disconnect
  disconnect: async (req, res) => {
    try {
      const userId = req.user.id;
      await db.UserIntegration.destroy({ where: { userId, provider: 'google' } });
      res.json({ success: true, message: 'Disconnected from Google Calendar' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = googleCalendarController;