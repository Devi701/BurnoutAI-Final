const cron = require('node-cron');
const jiraService = require('../services/jiraService');
const JiraIntegration = require('../models/JiraIntegration');

const startJiraSyncJob = () => {
  // Run every night at midnight (0 0 * * *)
  cron.schedule('0 0 * * *', async () => {
    console.log('⏰ Starting nightly Jira sync...');
    try {
      // Fetch all integrations
      const integrations = await JiraIntegration.findAll();
      console.log(`Found ${integrations.length} Jira integrations to sync.`);

      for (const integration of integrations) {
        try {
          console.log(`Syncing Jira for User ID: ${integration.userId}`);
          await jiraService.syncJiraData(integration.userId);
        } catch (err) {
          console.error(`Failed to sync User ${integration.userId}:`, err.message);
        }
      }
      console.log('✅ Nightly Jira sync complete.');
    } catch (error) {
      console.error('❌ Error in nightly Jira sync job:', error);
    }
  });
  
  console.log('📅 Jira Nightly Sync Job scheduled (Midnight).');
};

module.exports = { startJiraSyncJob };