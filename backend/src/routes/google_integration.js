const express = require('express');
const router = express.Router();
const googleCalendarController = require('../controllers/googleCalendarController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Public routes (Browser redirects)
router.get('/auth', googleCalendarController.auth);
router.get('/callback', googleCalendarController.callback);

// Protected routes
router.post('/sync', authenticateToken, googleCalendarController.sync);

module.exports = router;