import cron from 'node-cron';
import prisma from '../lib/prisma.js'; // Adjust path to your prisma client
import { google } from 'googleapis';
import { decrypt } from '../utils/encryption.js';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

/**
 * Fetches and processes Google Calendar data for all connected users.
 */
const syncGoogleCalendarData = async () => {
  console.log(`[${new Date().toISOString()}] Running Google Calendar data sync job...`);
  const integrations = await prisma.userIntegration.findMany({
    where: { provider: 'google', refreshToken: { not: null } }, // Only sync users with a refresh token
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
        // TODO: Process events to calculate insights (e.g., total meeting time).
        // TODO: Save these insights to a new `DailyMetrics` table in your database.
      }
    } catch (error) {
      console.error(`[User ${integration.userId}] Failed to sync Google Calendar data:`, error.message);
      // If the error is 'invalid_grant', the token was likely revoked by the user.
      if (error.response?.data?.error === 'invalid_grant') {
        console.log(`[User ${integration.userId}] Refresh token is invalid. Removing integration.`);
        await prisma.userIntegration.delete({ where: { id: integration.id } });
      }
    }
  }
  console.log(`[${new Date().toISOString()}] Google Calendar sync job finished.`);
};

/**
 * Starts all scheduled background jobs.
 */
export const startDataSyncJobs = () => {
  // Schedule to run at the beginning of every hour.
  cron.schedule('0 * * * *', syncGoogleCalendarData);
  console.log('Hourly data sync jobs have been scheduled.');
};