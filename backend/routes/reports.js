const express = require('express');
const router = express.Router();
const { getWeeklyReport, getPersonalHistory } = require('../services/reportService');

/**
 * @route   GET /api/reports/:companyCode
 * @desc    Get aggregated weekly report data for a company
 * @access  Private (should be protected by auth middleware)
 */
router.get('/:companyCode', async (req, res, next) => {
  try {
    const reportData = await getWeeklyReport(req.params.companyCode);
    res.json(reportData);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/reports/personal/me
 * @desc    Get personal history for the logged-in user
 * @access  Private (should be protected by auth middleware)
 */
router.get('/personal/me', async (req, res, next) => {
  try {
    // In a real app, req.user.id would come from an auth middleware (e.g., JWT)
    // For this example, we'll simulate it with a query parameter for testing.
    const userId = req.query.userId || 1; // Fallback to user 1 for now
    const reportData = await getPersonalHistory(userId);
    res.json(reportData);
  } catch (error) {
    next(error);
  }
});

module.exports = router;