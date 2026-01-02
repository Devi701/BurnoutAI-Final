const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
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
    let { type = 'small', userId, features } = req.body;
    
    // Fallback if features are at root
    if (!features) features = req.body;

    let continuousAdjustment = 0;

    // --- Advanced Continuous Prediction Logic (Daily Only) ---
    if (type === 'daily' && userId) {
      // 1. Historical Context Integration
      // Fetch Baseline Assessment (Full or Small) to set the "Risk Floor"
      const baseline = await db.QuizResult.findOne({
        where: { 
          userId,
          quizType: { [Op.in]: ['full', 'small'] }
        },
        order: [['createdAt', 'DESC']]
      });

      // Fetch recent history to calculate state (Fatigue, Sleep Debt, etc.)
      const history = await db.Checkin.findAll({
        where: { userId },
        order: [['createdAt', 'DESC']],
        limit: 14 // Look back 2 weeks
      });

      // Filter out "current" check-in if it was just saved (to avoid double counting in state)
      // We assume if the latest DB entry matches current features exactly, it's the one we just submitted.
      let pastCheckins = history;
      if (history.length > 0) {
        const latest = history[0];
        const isSame = latest.stress === features.stress && 
                       latest.sleep === features.sleep && 
                       latest.workload === features.workload;
        if (isSame) {
          pastCheckins = history.slice(1);
        }
      }

      // Calculate State Variables from Past
      let fatigueBank = 0;
      let resilienceBank = 0;
      let sleepSum = 0;
      let sleepCount = 0;
      let lastStress = null;
      let volatility = 0;

      // Process chronologically (oldest to newest)
      const chronological = [...pastCheckins].reverse();
      
      chronological.forEach(day => {
        // 2. Cumulative Fatigue (Burnout Debt)
        // Load = Stress + Workload. Recovery = Sleep + (Weekend Bonus).
        const dayDate = new Date(day.createdAt);
        const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
        
        const dailyLoad = day.stress + day.workload;
        const dailyRecovery = day.sleep + (isWeekend ? 4 : 2); // Weekends recover more, Base=2

        if (dailyLoad > dailyRecovery) {
          fatigueBank += (dailyLoad - dailyRecovery) * 0.5; // Accumulate debt
          resilienceBank = Math.max(0, resilienceBank - (dailyLoad - dailyRecovery)); // Drain resilience
        } else {
          fatigueBank = Math.max(0, fatigueBank - (dailyRecovery - dailyLoad) * 0.3); // Pay down debt
          resilienceBank = Math.min(20, resilienceBank + (dailyRecovery - dailyLoad) * 0.5); // Build resilience
        }

        // Sleep Stats
        sleepSum += day.sleep;
        sleepCount++;

        // 5. Volatility (Change in stress day-to-day)
        if (lastStress !== null) {
          volatility += Math.abs(day.stress - lastStress);
        }
        lastStress = day.stress;
      });

      // --- Apply System Dynamics to Current Features ---
      
      // 3. Sleep Debt Dynamics
      const avgSleep = sleepCount > 0 ? sleepSum / sleepCount : 8;
      if (avgSleep < 6) {
        // Chronic sleep deprivation amplifies current stress impact
        features.stress = Math.min(10, features.stress * 1.2); 
      }

      // 2. Apply Cumulative Fatigue (Input Modification)
      // We modify the input so the 'tips' generated are relevant to high stress
      features.stress = Math.min(10, features.stress + (fatigueBank * 0.3));

      // 2b. Apply Cumulative Fatigue (Direct Score Penalty)
      // We also add the fatigue bank directly to the score to ensure the user sees the impact
      // even if the Decision Tree model is discrete/rigid.
      continuousAdjustment += fatigueBank;

      // 4. Resilience Bonus (Buffer against bad days)
      // If history is good, subtract from the risk score
      continuousAdjustment -= resilienceBank;

      // 5. Volatility Penalty
      // High volatility in history adds a baseline anxiety (stress floor)
      const avgVolatility = sleepCount > 1 ? volatility / (sleepCount - 1) : 0;
      if (avgVolatility > 2) continuousAdjustment += avgVolatility;

      // 6. Baseline Bias
      // If a user has a high baseline burnout score, their daily risk is naturally higher
      if (baseline) {
        const baselineShift = (baseline.score - 50) * 0.2; // +/- shift based on baseline
        continuousAdjustment += baselineShift;
      }
    }

    // Monte Carlo Simulation for Robustness
    // We run the prediction multiple times with slight noise to simulate daily variance and model uncertainty
    let mcScoreSum = 0;
    const MC_ITERATIONS = 20;
    
    for (let i = 0; i < MC_ITERATIONS; i++) {
      const noise = () => (Math.random() * 0.5) - 0.25; // +/- 0.25 variance
      const mcFeatures = {
        ...features,
        stress: Math.max(0, Math.min(10, features.stress + noise())),
        sleep: Math.max(0, Math.min(24, features.sleep + noise())),
        workload: Math.max(0, Math.min(10, features.workload + noise())),
        coffee: Math.max(0, features.coffee + noise())
      };
      const p = predictAndAdvise(type, mcFeatures);
      mcScoreSum += p.score;
    }

    const result = predictAndAdvise(type, features);
    result.score = mcScoreSum / MC_ITERATIONS;
    
    // Apply the continuous adjustment to the final score
    if (type === 'daily' && userId) {
      result.score = Math.min(100, Math.max(0, result.score + continuousAdjustment));
    }

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