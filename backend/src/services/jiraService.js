const axios = require('axios');
const JiraIntegration = require('../models/JiraIntegration');
const JiraIssue = require('../models/JiraIssue');

const SCOPES = 'read:jira-work read:jira-user offline_access';

class JiraService {
  // 1. Generate the URL to redirect the user to Jira
  getAuthorizationUrl() {
    const authorizationUrl = 'https://auth.atlassian.com/authorize';
    const params = new URLSearchParams({
      audience: 'api.atlassian.com',
      client_id: process.env.JIRA_CLIENT_ID,
      scope: SCOPES,
      redirect_uri: process.env.JIRA_REDIRECT_URI,
      state: 'random_state_string', // In prod, use a secure random string
      response_type: 'code',
      prompt: 'consent'
    });
    return `${authorizationUrl}?${params.toString()}`;
  }

  // 2. Exchange the temporary code for Access & Refresh Tokens
  async exchangeCodeForToken(code, userId) {
    try {
      const response = await axios.post('https://auth.atlassian.com/oauth/token', {
        grant_type: 'authorization_code',
        client_id: process.env.JIRA_CLIENT_ID,
        client_secret: process.env.JIRA_CLIENT_SECRET,
        code: code,
        redirect_uri: process.env.JIRA_REDIRECT_URI
      });

      const { access_token, refresh_token, expires_in } = response.data;
      
      // Get the Cloud ID (Site ID)
      const resources = await axios.get('https://api.atlassian.com/oauth/token/accessible-resources', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      
      const cloudId = resources.data[0].id; // Taking the first available site

      // Save or Update in DB
      const expiresAt = new Date(Date.now() + expires_in * 1000);
      
      // Ensure table exists (simple sync for MVP)
      await JiraIntegration.sync(); 

      const [integration, created] = await JiraIntegration.upsert({
        userId,
        accessToken: access_token,
        refreshToken: refresh_token,
        cloudId,
        expiresAt
      });

      return integration;
    } catch (error) {
      console.error('Error exchanging Jira token:', error.response?.data || error.message);
      throw new Error('Failed to connect to Jira');
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
          refresh_token: integration.refreshToken
        });

        const { access_token, refresh_token, expires_in } = response.data;
        
        integration.accessToken = access_token;
        integration.refreshToken = refresh_token;
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
    const jql = 'order by created DESC';
    const searchUrl = `https://api.atlassian.com/ex/jira/${integration.cloudId}/rest/api/3/search`;

    try {
      const response = await axios.post(searchUrl, {
        jql,
        fields: ['summary', 'status', 'priority', 'customfield_10026', 'assignee', 'created', 'resolutiondate'], // customfield_10026 is often Story Points
        maxResults: 100
      }, {
        headers: { Authorization: `Bearer ${integration.accessToken}` }
      });

      const issues = response.data.issues;
      
      await JiraIssue.sync(); // Ensure table exists

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

      return { status: 'success', count: issues.length };
    } catch (error) {
      console.error('Error syncing Jira data:', error.response?.data || error.message);
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