const axios = require('axios');
const crypto = require('node:crypto');
const db = require('../config/database');
const TrelloCard = require('../models/TrelloCard');
const { decrypt, encrypt } = require('../utils/encryption');

// --- OAuth 1.0a Helper for Trello ---
class OAuth1Helper {
  constructor(consumerKey, consumerSecret) {
    this.consumerKey = consumerKey;
    this.consumerSecret = consumerSecret;
  }

  getTimestamp() { return Math.floor(Date.now() / 1000); }
  getNonce() { return crypto.randomBytes(16).toString('hex'); }

  percentEncode(str) {
    return encodeURIComponent(str)
      .replaceAll('!', '%21')
      .replaceAll('*', '%2A')
      .replaceAll("'", '%27')
      .replaceAll('(', '%28')
      .replaceAll(')', '%29');
  }

  generateSignature(method, url, params, tokenSecret = '') {
    const sortedParams = Object.keys(params).sort((a, b) => a.localeCompare(b)).map(key => {
      return `${this.percentEncode(key)}=${this.percentEncode(params[key])}`;
    }).join('&');

    const baseString = `${method.toUpperCase()}&${this.percentEncode(url)}&${this.percentEncode(sortedParams)}`;
    const signingKey = `${this.percentEncode(this.consumerSecret)}&${this.percentEncode(tokenSecret)}`;

    return crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
  }

  getAuthHeader(method, url, token = '', tokenSecret = '', extraParams = {}) {
    const params = {
      oauth_consumer_key: this.consumerKey,
      oauth_nonce: this.getNonce(),
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: this.getTimestamp(),
      oauth_version: '1.0',
      ...extraParams
    };

    if (token) params.oauth_token = token;

    params.oauth_signature = this.generateSignature(method, url, params, tokenSecret);

    return 'OAuth ' + Object.keys(params).sort((a, b) => a.localeCompare(b)).map(key => {
      return `${this.percentEncode(key)}="${this.percentEncode(params[key])}"`;
    }).join(', ');
  }
}

class TrelloService {
  constructor() {
    this.appName = 'BurnoutAI';
  }

  getOAuthHelper() {
    const key = process.env.TRELLO_API_KEY ? process.env.TRELLO_API_KEY.trim() : '';
    const secret = process.env.TRELLO_SECRET ? process.env.TRELLO_SECRET.trim() : '';
    if (!key || !secret) throw new Error('TRELLO_API_KEY or TRELLO_SECRET is missing');
    return new OAuth1Helper(key, secret);
  }

  // 1. Get Request Token (Step 1 of OAuth 1.0a)
  async getRequestToken(callbackUrl) {
    const oauth = this.getOAuthHelper();
    const url = 'https://trello.com/1/OAuthGetRequestToken';
    const method = 'POST';

    const authHeader = oauth.getAuthHeader(method, url, '', '', { oauth_callback: callbackUrl });

    try {
      const response = await axios.post(url, null, { headers: { Authorization: authHeader } });
      const params = new URLSearchParams(response.data);
      return {
        oauth_token: params.get('oauth_token'),
        oauth_token_secret: params.get('oauth_token_secret')
      };
    } catch (error) {
      console.error('[Trello Auth] Failed to get request token:', error.message);
      throw error;
    }
  }

  // 2. Exchange Verifier for Access Token (Step 3 of OAuth 1.0a)
  async getAccessToken(requestToken, requestTokenSecret, verifier) {
    const oauth = this.getOAuthHelper();
    const url = 'https://trello.com/1/OAuthGetAccessToken';
    const method = 'POST';

    const authHeader = oauth.getAuthHeader(method, url, requestToken, requestTokenSecret, { oauth_verifier: verifier });

    try {
      const response = await axios.post(url, null, { headers: { Authorization: authHeader } });
      const params = new URLSearchParams(response.data);
      return {
        oauth_token: params.get('oauth_token'),
        oauth_token_secret: params.get('oauth_token_secret')
      };
    } catch (error) {
      console.error('[Trello Auth] Failed to get access token:', error.message);
      throw error;
    }
  }

  // 3. Sync Data
  async syncTrelloData(userId) {
    console.log(`\n[Trello Sync] --- Starting Sync for User  ---`);
    try {
      const integration = await db.UserIntegration.findOne({
        where: { userId: Number(userId), provider: 'trello' }
      });

      if (!integration) {
        console.warn(`[Trello Sync] ❌ No integration found for user .`);
        return;
      }

      const token = decrypt(integration.accessToken);
      const apiKey = process.env.TRELLO_API_KEY.trim();

      // Fetch all boards for the user
      console.log(`[Trello Sync] 📡 Fetching boards...`);
      const boardsUrl = `https://api.trello.com/1/members/me/boards`;
      const boardsRes = await axios.get(boardsUrl, {
        params: { key: apiKey, token: token, fields: 'name' }
      });
      
      const boards = boardsRes.data;
      console.log(`[Trello Sync] Found ${boards.length} boards.`);

      let totalCards = 0;

      // For each board, fetch cards
      for (const board of boards) {
        console.log(`[Trello Sync] Fetching cards for board: ${board.name}`);
        const cardsUrl = `https://api.trello.com/1/boards/${board.id}/cards`;
        const cardsRes = await axios.get(cardsUrl, {
          params: { 
            key: apiKey, 
            token: token, 
            fields: 'name,desc,due,dateLastActivity,idList,url' 
          }
        });

        const cards = cardsRes.data;
        
        // We need list names to know if it's "Doing" or "Done"
        // Optimization: Fetch lists for the board once
        const listsUrl = `https://api.trello.com/1/boards/${board.id}/lists`;
        const listsRes = await axios.get(listsUrl, { params: { key: apiKey, token: token, fields: 'name' } });
        const listMap = {};
        listsRes.data.forEach(l => listMap[l.id] = l.name);

        for (const card of cards) {
          await TrelloCard.upsert({
            userId: Number(userId),
            cardId: card.id,
            name: card.name,
            desc: card.desc,
            boardName: board.name,
            listName: listMap[card.idList] || 'Unknown',
            due: card.due,
            url: card.url,
            lastActivity: card.dateLastActivity
          });
        }
        totalCards += cards.length;
      }

      integration.lastSyncedAt = new Date();
      await integration.save();

      console.log(`[Trello Sync] ✅ Sync Complete. Processed  cards.`);
      return totalCards;

    } catch (error) {
      console.error(`[Trello Sync] ❌ Failed for user :`, error.message);
      if (error.response) {
        if (error.response.status === 401) {
             console.error(`[Trello Sync] ❌ Token expired or revoked. Disconnecting.`);
             await db.UserIntegration.destroy({ where: { userId: Number(userId), provider: 'trello' } });
             return;
        }
        console.error(`[Trello Debug] Response:`, JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }
}

module.exports = new TrelloService();
