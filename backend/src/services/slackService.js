const axios = require('axios');
const db = require('../config/database');
const SlackActivity = require('../models/SlackActivity');
const { decrypt, encrypt } = require('../utils/encryption');
const { retryOperation } = require('../utils/apiHelper');

// Scopes required for analyzing user activity
// search:read is needed to count messages sent by the user ("from:me")
const SCOPES = ['search:read', 'users:read'];

class SlackService {
  // 1. Generate Auth URL
  getAuthorizationUrl(state) {
    const clientId = process.env.SLACK_CLIENT_ID ? process.env.SLACK_CLIENT_ID.trim() : '';
    const redirectUri = process.env.SLACK_REDIRECT_URI ? process.env.SLACK_REDIRECT_URI.trim() : '';
    
    console.log(`[Slack Auth] Generating URL with Redirect URI: '${redirectUri}'`);

    const params = new URLSearchParams({
      client_id: clientId,
      user_scope: SCOPES.join(','), // We use user_scope for search:read
      redirect_uri: redirectUri,
      state: state
    });

    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  }

  // 2. Exchange Code for Token
  async exchangeCodeForToken(code, userId) {
    console.log(`[Slack Auth] Exchanging code for tokens for User ${userId}...`);
    try {
      const response = await axios.post('https://slack.com/api/oauth.v2.access', null, {
        params: {
          client_id: process.env.SLACK_CLIENT_ID.trim(),
          client_secret: process.env.SLACK_CLIENT_SECRET.trim(),
          code: code,
          redirect_uri: process.env.SLACK_REDIRECT_URI.trim()
        }
      });

      if (!response.data.ok) {
        throw new Error(`Slack API Error: ${response.data.error}`);
      }

      const { authed_user } = response.data;

      if (!authed_user || !authed_user.access_token) {
        throw new Error('Slack response missing authed_user or access_token');
      }
      
      // Save to DB
      // Use findOne/create/update pattern to handle potential schema constraints better than upsert
      const existing = await db.UserIntegration.findOne({
        where: { userId: Number(userId), provider: 'slack' }
      });

      let integration;
      if (existing) {
        existing.accessToken = encrypt(authed_user.access_token);
        await existing.save();
        integration = existing;
      } else {
        // Try to create a new record
        integration = await db.UserIntegration.create({
          userId: Number(userId),
          provider: 'slack',
          accessToken: encrypt(authed_user.access_token)
        });
      }

      console.log(`[Slack Auth] ✅ Tokens saved. Integration ID: ${integration.id}`);
      return integration;
    } catch (error) {
      console.error(`[Slack Auth] ❌ Token exchange failed:`, error.message);
      // Detailed validation logging
      if (error.errors) {
        error.errors.forEach(e => {
          console.error(`   -> Validation: ${e.message} (${e.path})`);
          if (e.message === 'userId must be unique') {
            console.error(`\n   🚨 DATABASE SCHEMA ERROR DETECTED 🚨`);
            console.error(`   The 'user_integrations' table has an incorrect unique constraint on 'userId'.`);
            console.error(`   👉 FIX: Delete your local 'database.sqlite' file and restart the server to rebuild the schema.`);
            console.error(`   (Or manually drop the 'user_integrations' table if using a persistent DB)\n`);
          }
        });
      } else {
        console.error(`   -> Error Details:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
      }
      throw new Error('Failed to connect to Slack');
    }
  }

  // 3. Sync Data
  async syncSlackData(userId) {
    console.log(`\n[Slack Sync] --- Starting Sync for User ${userId} ---`);
    try {
      const integration = await db.UserIntegration.findOne({
        where: { userId: Number(userId), provider: 'slack' }
      });

      if (!integration || !integration.accessToken) {
        console.warn(`[Slack Sync] ❌ No integration found for user ${userId}.`);
        return;
      }

      const token = decrypt(integration.accessToken);

      // Incremental Sync Query
      let query = 'from:me';
      if (integration.lastSyncedAt) {
        const dateStr = integration.lastSyncedAt.toISOString().split('T')[0];
        query += ` after:${dateStr}`;
      }

      console.log(`[Slack Sync] 📡 Searching messages with query: "${query}"`);
      const response = await retryOperation(() => axios.get('https://slack.com/api/search.messages', {
        headers: { Authorization: `Bearer ${token}` },
        params: { query, sort: 'timestamp', sort_dir: 'desc', count: 100 }
      }));

      if (!response.data.ok) {
        const errorType = response.data.error;
        // Auto-disconnect if the token is revoked or invalid to clean up the DB
        if (['invalid_auth', 'account_inactive', 'token_revoked'].includes(errorType)) {
          console.error(`[Slack Sync] ❌ Token revoked/invalid for user ${userId} (${errorType}). Disconnecting.`);
          await db.UserIntegration.destroy({ where: { userId: Number(userId), provider: 'slack' } });
          return;
        }
        throw new Error(`Slack API Error: ${errorType}`);
      }

      const messages = response.data.messages.matches || [];
      console.log(`[Slack Sync] 📥 Fetched ${messages.length} messages.`);

      // Aggregate by date
      const dailyStats = {};
      messages.forEach(msg => {
        const date = new Date(msg.ts * 1000).toISOString().split('T')[0];
        if (!dailyStats[date]) dailyStats[date] = { count: 0, channels: new Set() };
        dailyStats[date].count++;
        dailyStats[date].channels.add(msg.channel.id);
      });

      console.log(`[Slack Sync] 💾 Saving daily stats to database...`);
      for (const [date, stats] of Object.entries(dailyStats)) {
        await SlackActivity.upsert({
          userId: Number(userId),
          date: date,
          messageCount: stats.count,
          channelCount: stats.channels.size
        });
      }

      integration.lastSyncedAt = new Date();
      await integration.save();

      console.log(`[Slack Sync] ✅ Sync Complete.`);
      return messages.length;
    } catch (error) {
      console.error(`[Slack Sync] ❌ Failed for user ${userId}:`, error.message);
      if (error.response) {
        console.error(`[Slack Debug] Response Status: ${error.response.status}`);
        console.error(`[Slack Debug] Response Data:`, JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }
}

module.exports = new SlackService();