const express = require('express');
const router = express.Router();
const jiraController = require('../controllers/jiraController');
const { authenticateToken } = require('../middleware/authMiddleware');
// Public routes (Browser redirects)
router.get('/auth', jiraController.auth);
router.get('/callback', jiraController.callback);

// Protected routes (Requires Login)
// Trigger a sync from Jira -> DB
router.post('/sync', authenticateToken, jiraController.sync);

// Fetch clean data for Python analysis
router.get('/analysis-data', authenticateToken, jiraController.getAnalysisData);

module.exports = router;