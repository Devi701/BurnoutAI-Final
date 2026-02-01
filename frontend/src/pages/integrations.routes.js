import { Router } from 'express';
import { connectGoogle, googleCallback } from '../controllers/integrations.controller.js';

const router = Router();

// @route   GET /api/integrations/connect/google
// @desc    Initiate Google OAuth flow. The user's JWT is passed as a query param.
// @access  Private (via token)
router.get('/connect/google', connectGoogle);

// @route   GET /api/integrations/callback/google
// @desc    Google OAuth callback. The original userId is in the 'state' param.
// @access  Public
router.get('/callback/google', googleCallback);

export default router;