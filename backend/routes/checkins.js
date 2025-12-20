const express = require('express');
const router = express.Router();
const db = require('../db/database');

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
    
    const newCheckin = await db.Checkin.create({
      userId,
      stress,
      sleep,
      workload,
      coffee,
      companyCode,
      note
    });

    res.status(201).json(newCheckin);
  } catch (error) {
    console.error('Error creating check-in:', error);
    res.status(400).json({ error: 'Failed to save check-in' });
  }
});

module.exports = router;