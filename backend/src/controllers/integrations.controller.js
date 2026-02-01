const jwt = require('jsonwebtoken');
const { getGoogleAuthUrl, getGoogleTokens, saveGoogleTokens } = require('../services/google.service');

const connectGoogle = (req, res) => {
  const { token, redirect } = req.query;
  if (!token) {
    return res.status(401).send('Authentication token is missing.');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    const userId = decoded.id;
    
    const state = redirect ? `${userId}|${redirect}` : String(userId);
    const url = getGoogleAuthUrl(state);
    res.redirect(url);
  } catch (error) {
    return res.status(401).send('Invalid or expired token.');
  }
};

const googleCallback = async (req, res) => {
  const { code, state } = req.query;
  let frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) {
     frontendUrl = 'https://www.razoncomfort.com';
  }

  let userId = state;
  let redirectPath = '/settings';

  if (state && state.includes('|')) {
    const parts = state.split('|');
    userId = parts[0];
    redirectPath = parts[1];
  }

  if (!code || !userId) {
    return res.redirect(`${frontendUrl}${redirectPath}?integration_error=google_missing_params`);
  }

  try {
    const tokens = await getGoogleTokens(code);
    await saveGoogleTokens(userId, tokens);
    const separator = redirectPath.includes('?') ? '&' : '?';
    res.redirect(`${frontendUrl}${redirectPath}${separator}integration_success=google`);
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    res.redirect(`${frontendUrl}${redirectPath}?integration_error=google_token_exchange`);
  }
};

module.exports = { connectGoogle, googleCallback };