const axios = require('axios');
const JiraIntegration = require('../models/JiraIntegration');
const JiraIssue = require('../models/JiraIssue');
const { encrypt, decrypt } = require('../utils/encryption');
const { retryOperation } = require('../utils/apiHelper');

const SCOPES = [
  'read:jira-work',
  'read:jira-user',
  'read:servicedesk-request',
  'offline_access'
].join(' ');

class JiraService {
  // 1. Generate the URL to redirect the user to Jira
  getAuthorizationUrl(state) {
    if (!process.env.JIRA_CLIENT_ID) {
      console.error('❌ Error: JIRA_CLIENT_ID is missing from environment variables.');
      throw new Error('Jira configuration missing (Client ID)');
    }

    const authorizationUrl = 'https://auth.atlassian.com/authorize';
    const params = new URLSearchParams({
      audience: 'api.atlassian.com',
      client_id: process.env.JIRA_CLIENT_ID.trim(),
      scope: SCOPES,
      redirect_uri: process.env.JIRA_REDIRECT_URI.trim(),
      state: state || 'random_state_string', // Pass userId or random string
      response_type: 'code',
      prompt: 'consent'
    });

    // Fix: Atlassian OAuth requires %20 for spaces in scope, URLSearchParams uses +
    const queryString = params.toString().replaceAll('+', '%20');
    return `${authorizationUrl}?${queryString}`;
  }

  // 2. Exchange the temporary code for Access & Refresh Tokens
  async exchangeCodeForToken(code, userId) {
    try {
      const response = await axios.post('https://auth.atlassian.com/oauth/token', {
        grant_type: 'authorization_code',
        client_id: process.env.JIRA_CLIENT_ID.trim(),
        client_secret: process.env.JIRA_CLIENT_SECRET.trim(),
        code: code,
        redirect_uri: process.env.JIRA_REDIRECT_URI.trim()
      });

      const { access_token, refresh_token, expires_in, scope } = response.data;
      
      console.log(`[Jira Auth] Token granted with scopes: ${scope}`);

      // Get the Cloud ID (Site ID)
      const resources = await axios.get('https://api.atlassian.com/oauth/token/accessible-resources', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      
      if (!resources.data || resources.data.length === 0) {
        throw new Error('No accessible Jira resources found for this user.');
      }

      console.log(`[Jira Auth] Found ${resources.data.length} accessible resources:`);
      resources.data.forEach(r => console.log(`   - Name: ${r.name}, ID: ${r.id}, URL: ${r.url}`));
      console.log(`[Jira Auth] Using first resource: ${resources.data[0].name}`);
      const cloudId = resources.data[0].id; // Taking the first available site

      // Save or Update in DB
      const expiresAt = new Date(Date.now() + expires_in * 1000);
      
      const [integration] = await JiraIntegration.upsert({
        userId,
        accessToken: encrypt(access_token),
        refreshToken: encrypt(refresh_token),
        cloudId,
        expiresAt
      });

      return integration;
    } catch (error) {
      console.error('Error exchanging Jira token:', error.response?.data || error.message);
      throw error; // Propagate error so controller can handle 'invalid_grant'
    }
  }

  // 3. Get a valid access token (Refresh if expired)
  async getValidToken(userId) {
    const integration = await JiraIntegration.findOne({ where: { userId } });
    if (!integration) throw new Error('Jira integration not found for user');

    if (new Date() >= integration.expiresAt) {
      console.log('Refreshing Jira Access Token...');
      try {
        const response = await axios.post('https://auth.atlassian.com/oauth/token', {
          grant_type: 'refresh_token',
          client_id: process.env.JIRA_CLIENT_ID,
          client_secret: process.env.JIRA_CLIENT_SECRET,
          refresh_token: decrypt(integration.refreshToken)
        });

        const { access_token, refresh_token, expires_in } = response.data;
        
        integration.accessToken = encrypt(access_token);
        integration.refreshToken = encrypt(refresh_token);
        integration.expiresAt = new Date(Date.now() + expires_in * 1000);
        await integration.save();
      } catch (error) {
        console.error('Failed to refresh token:', error.response?.data || error.message);
        throw new Error('Session expired. Please reconnect Jira.');
      }
    }
    return integration;
  }

  // 4. Sync Data: Fetch from Jira -> Store in DB
  async syncJiraData(userId) {
    const integration = await this.getValidToken(userId);
    
    // JQL to get all issues (adjust as needed)
    const jqlSuffix = 'order by updated DESC';
    let jql;
    
    // Incremental Sync: Only fetch issues updated since last sync
    if (integration.lastSyncedAt) {
      // Jira expects "yyyy-MM-dd HH:mm" format
      const dateStr = integration.lastSyncedAt.toISOString().replace('T', ' ').substring(0, 16);
      jql = `updated >= "${dateStr}" ${jqlSuffix}`;
    } else {
      jql = `created is not empty ${jqlSuffix}`;
    }

    const searchUrl = `https://api.atlassian.com/ex/jira/${integration.cloudId}/rest/api/3/search/jql`;

    // --- DEBUG LOGGING ---
    const token = decrypt(integration.accessToken);
    console.log(`\n[Jira Debug] --- Starting Sync for User ${userId} ---`);
    console.log(`[Jira Debug] Cloud ID: ${integration.cloudId}`);
    console.log(`[Jira Debug] Search URL: ${searchUrl}`);
    console.log(`[Jira Debug] JQL: ${jql}`);
    console.log(`[Jira Debug] Access Token (partial): ${token ? token.substring(0, 10) + '...' : 'NULL'}`);
    // ---------------------

    try {
      console.log(`[Jira Verify] 📡 Fetching issues from Jira for user ${userId}...`);
      const response = await retryOperation(() => axios.post(searchUrl, {
        jql,
        fields: ['summary', 'status', 'priority', 'customfield_10026', 'assignee', 'created', 'resolutiondate'], // customfield_10026 is often Story Points
        maxResults: 100
      }, {
        headers: { Authorization: `Bearer ${token}` }
      }));

      const issues = response.data.issues;
      console.log(`[Jira Verify] 📥 Fetched ${issues.length} issues. Encrypting and securing in database...`);
      
      // Bulk Upsert Logic
      for (const issue of issues) {
        await JiraIssue.upsert({
          integrationId: integration.id,
          issueKey: issue.key,
          summary: issue.fields.summary,
          status: issue.fields.status?.name,
          priority: issue.fields.priority?.name,
          storyPoints: issue.fields.customfield_10026 || 0,
          assignee: issue.fields.assignee?.displayName,
          createdDate: issue.fields.created,
          resolutionDate: issue.fields.resolutiondate
        });
      }

      // Update timestamp to prevent duplicates next time
      integration.lastSyncedAt = new Date();
      await integration.save();

      console.log(`[Jira Verify] ✅ Data successfully encrypted and secured in database.`);
      return { status: 'success', count: issues.length };
    } catch (error) {
      console.error(`[Jira Verify] ❌ Sync Failed.`);
      if (error.response) {
        console.error(`[Jira Debug] Status: ${error.response.status} ${error.response.statusText}`);
        console.error(`[Jira Debug] Response Data:`, JSON.stringify(error.response.data, null, 2));
        console.error(`[Jira Debug] Response Headers:`, JSON.stringify(error.response.headers, null, 2));
        if (error.response.headers['www-authenticate']) {
          console.error(`[Jira Debug] WWW-Authenticate: ${error.response.headers['www-authenticate']}`);
        }
      } else {
        console.error(`[Jira Debug] Error Message: ${error.message}`);
      }
      throw error;
    }
  }

  // 5. Fetch Data for Python Analysis
  async getDataForAnalysis(userId) {
    const integration = await JiraIntegration.findOne({ where: { userId } });
    if (!integration) return [];

    return await JiraIssue.findAll({
      where: { integrationId: integration.id },
      raw: true,
      order: [['createdDate', 'DESC']]
    });
  }
}

module.exports = new JiraService();
