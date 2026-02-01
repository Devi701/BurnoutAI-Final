import jwt from 'jsonwebtoken';
import { getGoogleAuthUrl, getGoogleTokens, saveGoogleTokens } from '../services/google.service.js';

/**
 * Redirects user to Google's consent screen.
 * We get the user's JWT from a query parameter because this is a simple redirect,
 * not a typical API call with an Authorization header.
 */
export const connectGoogle = (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(401).send('Authentication token is missing.');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;
    
    // The 'state' parameter is crucial for security and for linking the callback to the user.
    const url = getGoogleAuthUrl(userId);
    res.redirect(url);
  } catch (error) {
    return res.status(401).send('Invalid or expired token.');
  }
};

/**
 * Handles the callback from Google after user consent.
 */
export const googleCallback = async (req, res) => {
  const { code, state: userId } = req.query; // The 'state' contains the userId we passed.
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (!code || !userId) {
    return res.redirect(`${frontendUrl}/settings?integration_error=google_missing_params`);
  }

  try {
    const tokens = await getGoogleTokens(code);
    await saveGoogleTokens(userId, tokens);
    res.redirect(`${frontendUrl}/settings?integration_success=google`);
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    res.redirect(`${frontendUrl}/settings?integration_error=google_token_exchange`);
  }
};