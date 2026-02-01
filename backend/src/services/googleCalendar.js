const { google } = require('googleapis');
const { DataTypes } = require('sequelize');
const db = require('../config/database');
const { decrypt } = require('../utils/encryption');

// --- 1. Define Data Model for Storage ---
// We define the CalendarEvent model here to store the fetched data.
// This ensures we keep all integration data in our database for analysis.
const CalendarEvent = db.sequelize.define('CalendarEvent', {
  googleEventId: { type: DataTypes.STRING, unique: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  summary: { type: DataTypes.STRING },
  description: { type: DataTypes.TEXT },
  location: { type: DataTypes.STRING },
  startTime: { type: DataTypes.DATE },
  endTime: { type: DataTypes.DATE },
  attendees: { type: DataTypes.JSON }, // Storing attendees as JSON for analysis
  htmlLink: { type: DataTypes.STRING },
  status: { type: DataTypes.STRING },
  eventType: { type: DataTypes.STRING }, // 'default', 'focusTime', 'outOfOffice'
  creator: { type: DataTypes.JSON }
});

// Sync the model with the database (Safe Alter)
db.sequelize.sync({ alter: true }).catch(err => console.error('Calendar Model Sync Error:', err));

// --- 2. Configure OAuth Client ---
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

/**
 * Syncs Google Calendar events for a specific user to the database.
 * Fetches past 3 months and future 6 months to get comprehensive data for analysis.
 * 
 * @param {number|string} userId - The ID of the user to sync.
 */
exports.syncUserCalendar = async (userId) => {
  try {
    // 1. Retrieve User Integration tokens from DB
    const integration = await db.UserIntegration.findOne({
      where: { userId: Number(userId), provider: 'google' }
    });

    if (!integration || !integration.refreshToken) {
      console.warn(`No Google integration found for user ${userId} (or missing refresh token).`);
      return;
    }

    // 2. Setup Credentials (Decrypting tokens)
    oauth2Client.setCredentials({
      access_token: decrypt(integration.accessToken),
      refresh_token: decrypt(integration.refreshToken),
      expiry_date: integration.expiresAt ? new Date(integration.expiresAt).getTime() : null
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // 3. Fetch Events (Wide range for analysis)
    const timeMin = new Date();
    timeMin.setMonth(timeMin.getMonth() - 3); // Past 3 months
    const timeMax = new Date();
    timeMax.setMonth(timeMax.getMonth() + 6); // Future 6 months

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults: 2500, // Max per page
      singleEvents: true, // Expand recurring events
      orderBy: 'startTime',
    });

    const events = response.data.items || [];

    // 4. Store/Update in Database
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

    console.log(`Synced ${events.length} calendar events for user ${userId}.`);
    return events.length;

  } catch (error) {
    console.error(`Failed to sync calendar for user ${userId}:`, error.message);
    throw error;
  }
};

/**
 * Creates a new event in the user's primary calendar.
 */
exports.createEvent = async (userId, event) => {
  // Retrieve credentials
  const integration = await db.UserIntegration.findOne({
    where: { userId: Number(userId), provider: 'google' }
  });
  
  if (!integration) throw new Error('User not connected to Google');

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
};