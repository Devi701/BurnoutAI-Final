const trelloService = require('../services/trelloService');
const db = require('../config/database');
const jwt = require('jsonwebtoken');
const { encrypt, decrypt } = require('../utils/encryption');

const processedTokens = new Set(); // In-memory deduplication for Trello

const trelloController = {
  // 1. Start Auth Flow
  auth: async (req, res) => {
    console.log('[Trello Auth] 🚀 Starting auth flow...');
    let userId = req.query.userId || 1;

    if (req.query.token) {
      try {
        const decoded = jwt.verify(req.query.token, process.env.JWT_SECRET);
        if (decoded && decoded.id) {
          userId = decoded.id;
          console.log(`[Trello Auth] ✅ Verified user from token: ID ${userId}`);
        }
      } catch (err) {
        console.error('[Trello Auth] ❌ Invalid token:', err.message);
      }
    }

    try {
      // Determine callback URL
      let callbackUrl = process.env.TRELLO_REDIRECT_URI;

      // Fallback logic if not explicitly set in .env
      if (!callbackUrl) {
        let baseUrl = process.env.SLACK_REDIRECT_URI 
          ? new URL(process.env.SLACK_REDIRECT_URI).origin 
          : (process.env.FRONTEND_URL ? process.env.FRONTEND_URL.trim() : 'http://localhost:4000');
        
        // If running on Render, ensure we use the backend URL
        if (process.env.RENDER_EXTERNAL_URL) {
          baseUrl = process.env.RENDER_EXTERNAL_URL;
        }
        callbackUrl = `${baseUrl}/api/integrations/trello/callback`;
      }

      console.log(`[Trello Auth] Callback URL: ${callbackUrl}`);

      // Step 1: Get Request Token
      console.log('[Trello Auth] Requesting OAuth1 request token...');
      const { oauth_token, oauth_token_secret } = await trelloService.getRequestToken(callbackUrl);

      // Store secret temporarily in DB (using a pending state)
      // We use 'trello_pending' provider to store the secret needed for the callback
      await db.UserIntegration.upsert({
        userId: Number(userId),
        provider: 'trello_pending',
        accessToken: encrypt(oauth_token), // Store request token
        refreshToken: encrypt(oauth_token_secret) // Store secret
      });

      // Step 2: Redirect user
      const authUrl = `https://trello.com/1/OAuthAuthorizeToken?oauth_token=${oauth_token}&name=BurnoutAI&scope=read&expiration=never`;
      console.log(`[Trello Auth] 🔗 Redirecting User ${userId} to Trello...`);
      res.redirect(authUrl);

    } catch (error) {
      console.error('[Trello Auth] ❌ Error:', error.message);
      res.status(500).send('Failed to initiate Trello authentication.');
    }
  },

  // 2. Callback
  callback: async (req, res) => {
    // Prevent browser caching
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    console.log('[Trello Callback] 📥 Received callback.');
    const { oauth_token, oauth_verifier } = req.query;
    
    // Robust URL resolution
    let frontendUrl = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.trim() : '';
    if (!frontendUrl) {
      frontendUrl = process.env.NODE_ENV === 'production' ? 'https://www.razoncomfort.com' : 'http://localhost:5173';
    }
    frontendUrl = frontendUrl.replace(/\/$/, '');

    if (!oauth_token || !oauth_verifier) {
      console.error('[Trello Callback] ❌ Missing token or verifier.');
      return res.redirect(`${frontendUrl}/employee?integration_error=trello_missing_params`);
    }

    // In-Memory Deduplication (Using oauth_token as unique key)
    if (processedTokens.has(oauth_token)) {
      console.log(`[Trello Callback] ⚡ Fast dedup: Token ${oauth_token} already processed.`);
      return res.redirect(`${frontendUrl}/employee?integration_success=trello&cached=true`);
    }
    if (oauth_token) {
      processedTokens.add(oauth_token);
      setTimeout(() => processedTokens.delete(oauth_token), 5 * 60 * 1000);
    }

    try {
      // Find the pending integration to get the secret
      // We have to search by the request token (oauth_token) since we don't have userId in callback params for OAuth 1.0
      // However, we stored it encrypted. This is tricky.
      // Strategy: We iterate pending integrations or rely on a cookie. 
      // BETTER STRATEGY: Trello doesn't pass back 'state'. 
      // We will assume the most recent pending trello for simplicity or scan.
      // Since we encrypted it, we can't query by it easily without a hash.
      // FIX: For this MVP, we will fetch all 'trello_pending' and decrypt to match.
      
      console.log('[Trello Callback] 🔍 Searching for pending integration...');
      const pending = await db.UserIntegration.findAll({ where: { provider: 'trello_pending' } });
      let match = null;
      
      for (const p of pending) {
        if (decrypt(p.accessToken) === oauth_token) {
          match = p;
          break;
        }
      }

      if (!match) {
        // If no pending record is found, it likely means the callback ran twice and succeeded the first time.
        console.warn('[Trello Callback] ⚠️ No pending integration found. Assuming duplicate request/already processed.');
        return res.redirect(`${frontendUrl}/employee?integration_success=trello&dedup=db`);
      }

      const requestTokenSecret = decrypt(match.refreshToken);
      const userId = match.userId;
      console.log(`[Trello Callback] ✅ Found pending integration for User ${userId}.`);

      // Step 3: Exchange for Access Token
      console.log('[Trello Callback] 🔄 Exchanging verifier for access token...');
      const tokens = await trelloService.getAccessToken(oauth_token, requestTokenSecret, oauth_verifier);

      // Save real integration
      await db.UserIntegration.upsert({
        userId: userId,
        provider: 'trello',
        accessToken: encrypt(tokens.oauth_token),
        refreshToken: null, // Trello doesn't use refresh tokens for this flow
        expiresAt: null
      });

      // Cleanup pending
      await match.destroy();

      console.log(`[Trello Verify] 🔗 Connection successful for User ${userId}.`);

      console.log(`[Trello Callback] ✅ Redirecting to frontend: ${frontendUrl}/employee?integration_success=trello`);
      return res.redirect(`${frontendUrl}/employee?integration_success=trello`);

      // Trigger Sync in background AFTER response
      setImmediate(() => {
        console.log(`[Trello Verify] 🚀 Triggering background sync...`);
        trelloService.syncTrelloData(userId)
          .then(c => console.log(`[Trello Verify] ✨ Initial sync complete. ${c} cards.`))
          .catch(e => console.error(`[Trello Verify] ❌ Sync failed:`, e.message));
      });

    } catch (error) {
      console.error('[Trello Callback] ❌ Error:', error.message);
      if (error.response) {
        console.error('[Trello Callback] API Response:', JSON.stringify(error.response.data, null, 2));
      }
      return res.redirect(`${frontendUrl}/employee?integration_error=trello_failed`);
    }
  },

  // 3. Manual Sync
  sync: async (req, res) => {
    try {
      const userId = req.user.id;
      const count = await trelloService.syncTrelloData(userId);
      res.json({ success: true, count });
    } catch (error) { res.status(500).json({ error: error.message }); }
  },

  // 4. Get Status
  getStatus: async (req, res) => {
    try {
      const userId = req.user.id;
      const integration = await db.UserIntegration.findOne({ where: { userId, provider: 'trello' } });
      res.json({ connected: !!integration, lastSyncedAt: integration?.lastSyncedAt });
    } catch (error) { res.status(500).json({ error: error.message }); }
  },

  // 5. Disconnect
  disconnect: async (req, res) => {
    try {
      const userId = req.user.id;
      await db.UserIntegration.destroy({ where: { userId, provider: 'trello' } });
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
    }
};

module.exports = trelloController;
