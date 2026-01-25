const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const db = require('../db/database');
const GamificationService = require('../services/gamificationService');

// PostHog Backend Initialization
let posthog = null;
try {
  const PostHog = require('posthog-node').PostHog;
  if (process.env.POSTHOG_KEY) {
    posthog = new PostHog(process.env.POSTHOG_KEY, { host: 'https://eu.posthog.com' });
  }
} catch (e) { console.error('PostHog not configured in checkins:', e.message); }

// GET /api/checkins/history/:userId
// Fetches all check-ins for a specific user, ordered by newest first
router.get('/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Security: Prevent IDOR (Accessing another user's history)
    if (req.user.id !== Number.parseInt(userId, 10)) {
      return res.status(403).json({ error: 'Unauthorized access to this history.' });
    }

    const checkins = await db.Checkin.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']]
    });
    res.json({ checkins });
  } catch (error) {
    console.error('Error fetching check-in history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

async function handleCheckinStorage(userId, body) {
  const { 
    energy, sleepHours, sleepQuality, breaks, middayEnergy,
    stress, workload, anxiety,
    engagement, mood, motivation,
    peerSupport, managementSupport, commuteStress,
    companyCode, note 
  } = body;

  const user = await db.User.findByPk(userId);
  const isTestUser = user && user.email.toLowerCase() === 'testuser@gmail.com';
  
  let customDate = new Date();

  if (isTestUser) {
    // Test User: Increment date to simulate history (Next Day)
    const lastCheckin = await db.Checkin.findOne({
      where: { userId },
      order: [['createdAt', 'DESC']]
    });
    if (lastCheckin) {
      const nextDay = new Date(lastCheckin.createdAt);
      nextDay.setDate(nextDay.getDate() + 1);
      customDate = nextDay;
    }
  } else {
    // Production: Limit to one per day, overwrite if exists
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const existingCheckin = await db.Checkin.findOne({
      where: {
        userId,
        createdAt: { [Op.gte]: startOfDay, [Op.lte]: endOfDay }
      }
    });

    if (existingCheckin) {
      await existingCheckin.update({ 
        energy, sleepHours, sleepQuality, breaks, middayEnergy,
        stress, workload, anxiety, engagement, mood, motivation,
        peerSupport, managementSupport, commuteStress, companyCode, note 
      });
      return { checkin: existingCheckin, isNew: false };
    }
  }

  const newCheckin = await db.Checkin.create({
    userId,
    energy, sleepHours, sleepQuality, breaks, middayEnergy,
    stress, workload, anxiety,
    engagement, mood, motivation,
    peerSupport, managementSupport, commuteStress,
    companyCode,
    note,
    createdAt: customDate,
    updatedAt: customDate
  });

  return { checkin: newCheckin, isNew: true };
}

// POST /api/checkins
// Saves a new daily check-in
router.post('/', async (req, res) => {
  try {
    const { userId, companyCode, stress, energy, workload, sleepQuality, engagement } = req.body;
    
    const { checkin, isNew } = await handleCheckinStorage(userId, req.body);

    if (!isNew) {
      return res.status(200).json(checkin);
    }

    // --- Gamification Trigger ---
    const gamificationResult = await GamificationService.processEvent(userId, 'daily_checkin', { streak: 1 }); // Placeholder streak

    // --- Analytics Tracking ---
    if (posthog) {
      try {
        const count = await db.Checkin.count({ where: { userId } });
        if (count === 1) {
          posthog.capture({ distinctId: String(userId), event: 'first_checkin_completed', properties: { company_id: companyCode } });
        }
        posthog.capture({
          distinctId: String(userId),
          event: 'daily_checkin_completed',
          properties: {
            stress, energy, workload, sleep_quality: sleepQuality, 
            company_id: companyCode,
            engagement
          }
        });
      } catch (err) { console.error('Analytics error:', err.message); }
    }

    res.status(201).json({ ...checkin.toJSON(), gamification: gamificationResult });
  } catch (error) {
    console.error('Error creating check-in:', error);
    res.status(400).json({ error: 'Failed to save check-in' });
  }
});

// DELETE /api/checkins/history/:userId
// Clears check-in history for a user (Dev only)
router.delete('/history/:userId', async (req, res) => {
  // Safety check: Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'This feature is disabled in production.' });
  }

  try {
    const { userId } = req.params;
    await db.Checkin.destroy({ where: { userId } });
    if (db.QuizResult) {
      await db.QuizResult.destroy({ where: { userId } });
    }
    res.json({ message: 'History cleared successfully.' });
  } catch (error) {
    console.error('Error clearing history:', error);
    res.status(500).json({ error: 'Failed to clear history' });
  }
});

module.exports = router;