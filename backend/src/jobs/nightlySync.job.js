const cron = require('node-cron');
const db = require('../config/database');
// JiraIntegration is a separate model, so we need it.
const JiraIntegration = require('../models/JiraIntegration');
const jiraService = require('../services/jiraService');
const googleCalendarService = require('../services/googleCalendar');
const slackService = require('../services/slackService');
const trelloService = require('../services/trelloService');

// Helper to add a delay between requests to avoid rate limits
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const startNightlySync = () => {
  // Run at 2:00 AM every night (0 2 * * *)
  cron.schedule('0 2 * * *', async () => {
    console.log('🌙 [Cron] Starting Nightly Sync Job...');
    const startTime = Date.now();

    try {
      // 1. Fetch all integrations from both tables
      const userIntegrations = await db.UserIntegration.findAll();
      const jiraIntegrations = await JiraIntegration.findAll();

      // 2. Create a map of services for easy lookup
      const services = {
        google: googleCalendarService.syncUserCalendar,
        slack: slackService.syncSlackData,
        trello: trelloService.syncTrelloData,
        jira: jiraService.syncJiraData,
      };

      // 3. Process standard integrations (Google, Slack, Trello)
      console.log(`[Cron] Processing ${userIntegrations.length} standard integrations...`);
      for (const integration of userIntegrations) {
        const { userId, provider } = integration;
        const syncFunction = services[provider];
        if (syncFunction) {
          try {
            await syncFunction(userId);
            await delay(500); // Small delay to be polite to APIs
          } catch (e) {
            console.error(`❌ [Cron] ${provider} sync failed for user ${userId}:`, e.message);
          }
        }
      }

      // 4. Process Jira integrations
      console.log(`[Cron] Processing ${jiraIntegrations.length} Jira integrations...`);
      for (const integration of jiraIntegrations) {
        const { userId } = integration;
        try {
          await services.jira(userId);
          await delay(500);
        } catch (e) {
          console.error(`❌ [Cron] Jira sync failed for user ${userId}:`, e.message);
        }
      }
    } catch (err) {
      // This catches fatal errors, like failing to connect to the DB
      console.error('🔥 [Cron] Critical Error during Nightly Sync Job:', err);
    }

    const duration = (Date.now() - startTime) / 1000;
    console.log(`✅ [Cron] Nightly Sync Complete in ${duration}s.`);
  });

  console.log('📅 Nightly Sync Job scheduled (02:00 AM).');
};

module.exports = { startNightlySync };