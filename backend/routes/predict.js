const express = require('express');
const router = express.Router();
const { predictAndAdvise } = require('../services/predictionService');
const db = require('../db/database');

/**
 * @route   POST /
 * @desc    Get a burnout score prediction based on quiz answers.
 *          This route is mounted at /api/predict, so its full path is POST /api/predict.
 * @access  Public
 */
router.post('/', async (req, res, next) => {
  try {
    // Expect a body like: { type: 'small'|'full', features: { ... } }
    const { type = 'small', userId, features } = req.body;
    const result = predictAndAdvise(type, req.body);

    // If a userId is provided, save the result for reporting
    if (userId) {
      let breakdown = null;
      
      if (type === 'full' && features) {
        const categories = {
          'Emotional Exhaustion': ['EE1', 'EE2', 'EE3', 'EE4', 'EE5', 'EE6', 'EE7'],
          'Stress': ['S1', 'S2', 'S3', 'S4', 'S5'],
          'Somatic Fatigue': ['SFQ1', 'SFQ2', 'SFQ3'],
          'Work Pressure': ['wp1', 'wp2', 'wp3', 'wp4'],
          'Cognitive Demands': ['cogn1', 'cogn2', 'cogn3', 'cogn4'],
          'Support': ['SS1', 'SS2', 'SS3', 'CS1', 'CS2', 'CS3'],
          'Autonomy': ['auton1', 'auton2', 'auton3']
        };

        breakdown = {};
        for (const [cat, fields] of Object.entries(categories)) {
          let sum = 0, count = 0;
          fields.forEach(f => {
            if (features[f] !== undefined) { sum += Number(features[f]); count++; }
          });
          breakdown[cat] = count > 0 ? sum / count : 0;
        }
      }

      await db.QuizResult.create({
        userId,
        quizType: type,
        score: result.score,
        breakdown
      });
    }

    res.json(result);
  } catch (error) {
    // Pass any errors to the global error handler in index.js
    next(error);
  }
});

module.exports = router;