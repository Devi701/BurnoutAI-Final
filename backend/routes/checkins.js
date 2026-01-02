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
} catch (e) { console.log('PostHog not configured in checkins.'); }

// GET /api/checkins/history/:userId
// Fetches all check-ins for a specific user, ordered by newest first
router.get('/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
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

// POST /api/checkins
// Saves a new daily check-in
router.post('/', async (req, res) => {
  try {
    const { userId, stress, sleep, workload, coffee, companyCode, note } = req.body;
    
    // Check if user is the designated test user for unlimited check-ins
    const user = await db.User.findByPk(userId);
    const isTestUser = user && user.email.toLowerCase() === 'testuser@gmail.com';
    
    let customDate = new Date();

    if (!isTestUser) {
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
        await existingCheckin.update({ stress, sleep, workload, coffee, companyCode, note });
        return res.status(200).json(existingCheckin);
      }
    } else {
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
    }

    const newCheckin = await db.Checkin.create({
      userId,
      stress,
      sleep,
      workload,
      coffee,
      companyCode,
      note,
      createdAt: customDate,
      updatedAt: customDate
    });

    // --- Gamification Trigger ---
    // Calculate streak (simplified for this context, or pass existing streak logic)
    // We'll let the service handle the logic, just passing the event
    // Ideally, we pass the calculated streak from below, but for MVP we trigger 'daily_checkin'
    // The service will handle basic XP.
    const gamificationResult = await GamificationService.processEvent(userId, 'daily_checkin', { streak: 1 }); // Placeholder streak

    // --- Analytics Tracking ---
    if (posthog) {
      try {
        const user = await db.User.findByPk(userId);
        if (user) {
          // Check if this is the first checkin
          const count = await db.Checkin.count({ where: { userId } });
          
          if (count === 1) {
            posthog.capture({ distinctId: String(userId), event: 'first_checkin_completed', properties: { company_id: companyCode } });
          }

          // Calculate Streak
          const recentCheckins = await db.Checkin.findAll({
            where: { userId },
            attributes: ['createdAt'],
            order: [['createdAt', 'DESC']],
            limit: 60
          });
          
          let streak = 0;
          const uniqueDays = [...new Set(recentCheckins.map(c => new Date(c.createdAt).setHours(0,0,0,0)))];
          const today = new Date().setHours(0,0,0,0);
          
          if (uniqueDays.length > 0 && uniqueDays[0] === today) {
             streak = 1;
             let current = today;
             for (let i = 1; i < uniqueDays.length; i++) {
                const prev = new Date(current);
                prev.setDate(prev.getDate() - 1);
                if (uniqueDays[i] === prev.setHours(0,0,0,0)) {
                   streak++;
                   current = uniqueDays[i];
                } else {
                   break;
                }
             }
          }

          if (streak > 1) {
             posthog.capture({ distinctId: String(userId), event: 'streak_reached', properties: { streak_length: streak, company_id: companyCode } });
          }

          posthog.capture({
            distinctId: String(userId),
            event: 'daily_checkin_completed',
            properties: {
              stress, sleep, workload, coffee, company_id: companyCode, streak_length: streak
            }
          });
        }
      } catch (err) { console.error('Analytics error:', err.message); }
    }

    res.status(201).json({ ...newCheckin.toJSON(), gamification: gamificationResult });
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