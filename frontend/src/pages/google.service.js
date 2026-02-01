import { google } from 'googleapis';
import prisma from '../lib/prisma.js'; // Adjust this path to your prisma client instance
import { encrypt } from '../utils/encryption.js';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const scopes = [
  'https://www.googleapis.com/auth/calendar.events.readonly', // Read-only access to calendar events
];

/**
 * Generates the Google Authentication URL to redirect the user to.
 * @param {string|number} userId - The ID of the user initiating the connection.
 */
export const getGoogleAuthUrl = (userId) => {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // Required to get a refresh token
    prompt: 'consent',      // Ensures the user is prompted for consent, which provides a refresh token
    scope: scopes,
    state: String(userId),  // Pass the userId in the state to identify the user on callback
  });
};

/**
 * Exchanges an authorization code for access and refresh tokens.
 * @param {string} code - The authorization code from Google's callback.
 */
export const getGoogleTokens = async (code) => {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
};

/**
 * Encrypts and saves Google tokens to the database for a specific user.
 * @param {string|number} userId - The ID of the user.
 * @param {object} tokens - The tokens object from Google.
 */
export const saveGoogleTokens = async (userId, tokens) => {
  const { access_token, refresh_token, expiry_date } = tokens;

  if (!refresh_token) {
    console.warn(`No refresh token received for user ${userId}. This can happen on re-authentication without 'prompt: consent'. The access token will still be updated.`);
  }

  const dataToStore = {
    accessToken: encrypt(access_token),
    expiresAt: new Date(expiry_date),
    ...(refresh_token && { refreshToken: encrypt(refresh_token) }), // Only include refreshToken if it exists
  };

  await prisma.userIntegration.upsert({
    where: { userId_provider: { userId: parseInt(userId, 10), provider: 'google' } },
    update: dataToStore,
    create: {
      userId: parseInt(userId, 10),
      provider: 'google',
      ...dataToStore,
    },
  });
};