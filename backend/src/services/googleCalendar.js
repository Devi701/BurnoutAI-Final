const { google } = require('googleapis');
const { DataTypes } = require('sequelize');
const db = require('../config/database');
const CalendarEvent = require('../models/CalendarEvent');
const { decrypt, encrypt } = require('../utils/encryption');
const { retryOperation } = require('../utils/apiHelper');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'profile',
  'email'
];

// --- Helper: Configure OAuth Client ---
const createOAuthClient = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID ? process.env.GOOGLE_CLIENT_ID.trim() : '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ? process.env.GOOGLE_CLIENT_SECRET.trim() : '';
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ? process.env.GOOGLE_REDIRECT_URI.trim() : '';

  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
};

class GoogleCalendarService {
  // 1. Generate Auth URL
  getAuthorizationUrl(state) {
    const oauth2Client = createOAuthClient();
    
    // Debug log to help fix redirect_uri_mismatch errors
    console.log(`[Google Auth] Generating URL with Redirect URI: '${oauth2Client.redirectUri}'`);
    
    return oauth2Client.generateAuthUrl({
      access_type: 'offline', // Crucial for receiving a refresh token
      prompt: 'consent',      // Force consent to ensure refresh token is returned
      scope: SCOPES,
      state: state
    });
  }

  // 2. Exchange Code for Tokens
  async exchangeCodeForToken(code, userId) {
    console.log(`[Google Auth] Exchanging code for tokens for User ${userId}...`);
    try {
      const oauth2Client = createOAuthClient();
      console.log(`[Google Auth] Using Redirect URI for exchange: '${oauth2Client.redirectUri}'`);
      const { tokens } = await oauth2Client.getToken(code);

      if (!tokens.refresh_token) {
        console.warn(`[Google Auth] ⚠️ No refresh token received. User may need to revoke access and re-auth.`);
      }

      // Save to DB
      const payload = {
        userId: Number(userId),
        provider: 'google',
        accessToken: encrypt(tokens.access_token),
        expiresAt: new Date(tokens.expiry_date)
      };

      if (tokens.refresh_token) {
        payload.refreshToken = encrypt(tokens.refresh_token);
      }

      const [integration, created] = await db.UserIntegration.upsert(payload);
      console.log(`[Google Auth] ✅ Tokens saved. Integration ID: ${integration.id} (Created: ${created})`);
      
      return integration;
    } catch (error) {
      console.error(`[Google Auth] ❌ Token exchange failed:`, error.message);
      throw error;
    }
  }

/**
 * Syncs Google Calendar events for a specific user to the database.
 * Fetches past 3 months and future 6 months to get comprehensive data for analysis.
 * 
 * @param {number|string} userId - The ID of the user to sync.
 */
  async syncUserCalendar(userId) {
    console.log(`\n[Google Sync] --- Starting Sync for User ${userId} ---`);
  try {
    // 1. Retrieve User Integration tokens from DB
    const integration = await db.UserIntegration.findOne({
      where: { userId: Number(userId), provider: 'google' }
    });

    if (!integration || !integration.refreshToken) {
      console.warn(`[Google Sync] ❌ No integration or refresh token found for user ${userId}. Aborting.`);
      return;
    }

    // 2. Setup Credentials (Decrypting tokens)
    console.log(`[Google Sync] 🔐 Decrypting credentials...`);
    const oauth2Client = createOAuthClient();
    
    oauth2Client.setCredentials({
      access_token: decrypt(integration.accessToken),
      refresh_token: decrypt(integration.refreshToken),
      expiry_date: integration.expiresAt ? new Date(integration.expiresAt).getTime() : null
    });

    // Handle Token Refresh automatically
    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        console.log(`[Google Sync] 🔄 Refreshing Access Token for user ${userId}...`);
        integration.accessToken = encrypt(tokens.access_token);
        if (tokens.refresh_token) {
          integration.refreshToken = encrypt(tokens.refresh_token);
        }
        if (tokens.expiry_date) {
          integration.expiresAt = new Date(tokens.expiry_date);
        }
        await integration.save();
      }
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // 3. Fetch Events (Wide range for analysis)
    console.log(`[Google Sync] 📡 Fetching events from Google API...`);
    const timeMin = new Date();
    timeMin.setMonth(timeMin.getMonth() - 3); // Past 3 months
    const timeMax = new Date();
    timeMax.setMonth(timeMax.getMonth() + 6); // Future 6 months

    const requestParams = {
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults: 2500, // Max per page
      singleEvents: true, // Expand recurring events
      orderBy: 'startTime',
    };

    // Incremental Sync: Only fetch events modified since last sync
    if (integration.lastSyncedAt) {
      requestParams.updatedMin = integration.lastSyncedAt.toISOString();
    }

    console.log(`[Google Sync] Request Params: TimeMin=${requestParams.timeMin}, MaxResults=${requestParams.maxResults}`);
    const response = await retryOperation(() => calendar.events.list(requestParams));

    const events = response.data.items || [];
    console.log(`[Google Sync] 📥 Fetched ${events.length} events.`);

    // 4. Store/Update in Database
    console.log(`[Google Sync] 💾 Saving events to database...`);
    for (const event of events) {
      await CalendarEvent.upsert({
        googleEventId: event.id,
        userId: Number(userId),
        summary: event.summary,
        description: event.description,
        location: event.location,
        startTime: event.start.dateTime || event.start.date,
        endTime: event.end.dateTime || event.end.date,
        attendees: event.attendees,
        htmlLink: event.htmlLink,
        status: event.status,
        eventType: event.eventType,
        creator: event.creator
      });
    }

    // Update timestamp (Assuming UserIntegration model has this field, 
    // otherwise ensure you add it to the model definition)
    integration.lastSyncedAt = new Date();
    await integration.save();

    console.log(`[Google Sync] ✅ Sync Complete. ${events.length} events processed.`);
    return events.length;

  } catch (error) {
    // Check for token revocation error from Google's API
    if (error.response?.data?.error === 'invalid_grant') {
      console.error(`[Google Sync] ❌ Token revoked for user ${userId}. Disconnecting integration.`);
      // Automatically remove the integration to prevent future failed syncs
      await db.UserIntegration.destroy({ where: { userId: Number(userId), provider: 'google' } });
      // We don't re-throw here because this is a final, handled state, not a transient failure.
    } else {
      console.error(`[Google Sync] ❌ Sync failed for user ${userId}:`, error.message);
      throw error; // Re-throw other unexpected errors
    }
  }
}

/**
 * Creates a new event in the user's primary calendar.
 */
  async createEvent(userId, event) {
  // Retrieve credentials
  const integration = await db.UserIntegration.findOne({
    where: { userId: Number(userId), provider: 'google' }
  });
  
  if (!integration) throw new Error('User not connected to Google');

  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({
    access_token: decrypt(integration.accessToken),
    refresh_token: decrypt(integration.refreshToken)
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  
  const res = await calendar.events.insert({
    calendarId: 'primary',
    resource: event,
  });

  // Save the new event to our DB immediately
  await CalendarEvent.upsert({
    googleEventId: res.data.id,
    userId: Number(userId),
    summary: res.data.summary,
    startTime: res.data.start.dateTime || res.data.start.date,
    endTime: res.data.end.dateTime || res.data.end.date,
    status: res.data.status,
    htmlLink: res.data.htmlLink
  });

  return res.data;
}
}

module.exports = new GoogleCalendarService();