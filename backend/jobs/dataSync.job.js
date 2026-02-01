const cron = require('node-cron');
const db = require('../db/database');
const { google } = require('googleapis');
const { decrypt } = require('../utils/encryption');
const { Op } = require('sequelize');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

/**
 * Fetches and processes Google Calendar data.
 */
const syncGoogleCalendarData = async () => {
  console.log(`[${new Date().toISOString()}] Running Google Calendar data sync job...`);
  
  // Fetch integrations that have a refresh token
  const integrations = await db.UserIntegration.findAll({
    where: { 
      provider: 'google', 
      refreshToken: { [Op.ne]: null } 
    }
  });

  for (const integration of integrations) {
    try {
      oauth2Client.setCredentials({
        refresh_token: decrypt(integration.refreshToken),
      });

      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);

      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: oneHourAgo.toISOString(),
        timeMax: new Date().toISOString(),
        maxResults: 100,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items;
      if (events && events.length > 0) {
        console.log(`[User ${integration.userId}] Found ${events.length} events in the last hour.`);
        // Logic to save metrics would go here
      }
    } catch (error) {
      console.error(`[User ${integration.userId}] Failed to sync Google Calendar data:`, error.message);
      
      if (error.response?.data?.error === 'invalid_grant') {
        console.log(`[User ${integration.userId}] Refresh token is invalid. Removing integration.`);
        await integration.destroy();
      }
    }
  }
  console.log(`[${new Date().toISOString()}] Google Calendar sync job finished.`);
};

const startDataSyncJobs = () => {
  cron.schedule('0 * * * *', syncGoogleCalendarData);
  console.log('Hourly data sync jobs have been scheduled.');
};

module.exports = { startDataSyncJobs };