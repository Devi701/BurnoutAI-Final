const express = require('express');
const router = express.Router();
const GamificationService = require('../services/gamificationService');

// GET /api/gamification/profile/:userId
router.get('/profile/:userId', async (req, res) => {
  try {
    const profile = await GamificationService.getProfile(req.params.userId);
    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/gamification/leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const leaderboard = await GamificationService.getLeaderboard();
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/gamification/settings
router.put('/settings', async (req, res) => {
  try {
    const { userId, optInLeaderboard } = req.body;
    const stats = await GamificationService.updateSettings(userId, { optInLeaderboard });
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/gamification/challenges
router.get('/challenges', async (req, res) => {
  try {
    const { userId } = req.query;
    const challenges = await GamificationService.getChallenges(userId);
    res.json(challenges);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/gamification/challenges/join
router.post('/challenges/join', async (req, res) => {
  try {
    const { userId, challengeId } = req.body;
    await GamificationService.joinChallenge(userId, challengeId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;