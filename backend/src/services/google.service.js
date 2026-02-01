const { google } = require('googleapis');
const db = require('../config/database');
const { encrypt } = require('../utils/encryption');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const scopes = [
  'https://www.googleapis.com/auth/calendar.events.readonly',
];

/**
 * Generates the Google Authentication URL.
 */
const getGoogleAuthUrl = (state) => {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
    state: state,
  });
};

/**
 * Exchanges authorization code for tokens.
 */
const getGoogleTokens = async (code) => {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
};

/**
 * Encrypts and saves Google tokens to the database using Sequelize.
 */
const saveGoogleTokens = async (userId, tokens) => {
  const { access_token, refresh_token, expiry_date } = tokens;

  if (!refresh_token) {
    console.warn(`No refresh token received for user ${userId}.`);
  }

  const payload = {
    userId: Number(userId),
    provider: 'google',
    accessToken: encrypt(access_token),
    expiresAt: new Date(expiry_date)
  };

  if (refresh_token) {
    payload.refreshToken = encrypt(refresh_token);
  }

  const existing = await db.UserIntegration.findOne({ 
    where: { userId: Number(userId), provider: 'google' } 
  });

  if (existing) {
    await existing.update(payload);
  } else {
    await db.UserIntegration.create(payload);
  }
};

module.exports = { getGoogleAuthUrl, getGoogleTokens, saveGoogleTokens };