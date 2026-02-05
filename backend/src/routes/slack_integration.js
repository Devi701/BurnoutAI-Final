const express = require('express');
const router = express.Router();
const slackController = require('../controllers/slackController');

// Public routes (Browser redirects)
router.get('/auth', slackController.auth);
router.get('/callback', slackController.callback);

module.exports = router;