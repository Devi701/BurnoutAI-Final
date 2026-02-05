const express = require('express');
const router = express.Router();
const googleCalendarController = require('../controllers/googleCalendarController');
const jiraController = require('../controllers/jiraController');

router.get('/connect/google', googleCalendarController.auth);
router.get('/callback/google', googleCalendarController.callback);

router.get('/connect/jira', jiraController.auth);

module.exports = router;