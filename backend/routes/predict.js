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
    let baselineTip = null;

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
      // Full and small assessments directly affect daily checkin (+/- 10)
      if (baseline) {
        // Check if baseline is older than 3 weeks (21 days)
        const daysSince = Math.floor((new Date() - new Date(baseline.createdAt)) / (1000 * 60 * 60 * 24));
        if (daysSince > 21) {
          baselineTip = "It's been a few weeks. Please retake the Full Assessment to track your improvement.";
        }

        // Apply direct +/- 10 adjustment based on baseline
        // If baseline is high risk (>50), add 10. If low/moderate, subtract 10.
        continuousAdjustment += (baseline.score > 50 ? 10 : -10);
      }
    }

    let result = { score: 0, tips: [] };

    if (type === 'full') {
      // --- Heuristic Logic for Full Assessment (Non-linear Scaling) ---
      // Complex heuristic that scales non-linearly based on multiple agreements
      
      const config = {
        boundaries_yes: { weight: 1.0, tip: "Practice saying 'no' to small requests first." },
        social_cancel: { weight: 1.2, tip: "Protect your personal time; isolation worsens burnout." },
        conceal_deadlines: { weight: 1.4, tip: "Transparency reduces anxiety. Communicate delays early." },
        escape_thoughts: { weight: 1.5, tip: "Consider speaking with a mentor about your career path." },
        distractions: { weight: 1.0, tip: "Use time-blocking to manage focus periods." },
        unhealthy_soothing: { weight: 1.5, tip: "Seek healthy coping mechanisms like exercise or talking to a friend." },
        no_breaks: { weight: 1.1, tip: "Set a timer for 5-minute breaks every hour." },
        skip_lunch: { weight: 1.1, tip: "Nutrition fuels resilience. Step away for lunch." },
        stimulants: { weight: 1.0, tip: "Reduce caffeine intake after noon to improve sleep." },
        hard_switch_off: { weight: 1.2, tip: "Create a transition ritual to separate work from home life." },
        sleep_worry: { weight: 1.3, tip: "Write down tomorrow's to-do list before bed to clear your mind." }
      };

      let weightedSum = 0;
      let maxPossibleWeighted = 0;
      let highSeverityCount = 0; // Answers > 50
      let criticalCount = 0;     // Answers > 75
      const activeTips = [];

      for (const [key, val] of Object.entries(features)) {
        const score = Number(val) || 0;
        const meta = config[key] || { weight: 1.0 };
        
        weightedSum += score * meta.weight;
        maxPossibleWeighted += 100 * meta.weight;

        if (score > 50) highSeverityCount++;
        if (score > 75) {
          criticalCount++;
          if (meta.tip) activeTips.push(meta.tip);
        }
      }

      let baseScore = (weightedSum / maxPossibleWeighted) * 100;

      // Non-Linear Scaling: Compounding multiplier based on number of issues
      const compoundingMultiplier = 1 + (Math.pow(highSeverityCount, 1.6) / 100);
      
      // Exponential penalty for critical items
      const criticalPenalty = Math.pow(criticalCount, 1.8) * 1.2;

      let finalScore = (baseScore * compoundingMultiplier) + criticalPenalty;
      result.score = Math.min(100, Math.max(0, Math.round(finalScore)));
      result.tips = activeTips.slice(0, 5);
      if (result.tips.length === 0) result.tips.push("You seem to be balancing well. Keep it up!");

    } else {
      // --- Existing Logic for Daily / Small (Monte Carlo + AI Service) ---
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

      const prediction = predictAndAdvise(type, features);
      result = prediction;
      result.score = mcScoreSum / MC_ITERATIONS;
      
      // Apply the continuous adjustment to the final score (Daily only)
      if (type === 'daily' && userId) {
        result.score = Math.min(100, Math.max(0, result.score + continuousAdjustment));
        if (baselineTip) {
          result.tips.push(baselineTip);
        }
      }
    }

    // If a userId is provided, save the result for reporting
    if (userId) {
      let breakdown = null;
      
      if (type === 'full' && features) {
        const categories = {
          'Workload & Boundaries': ['boundaries_yes', 'social_cancel', 'no_breaks', 'skip_lunch'],
          'Recovery & Detachment': ['hard_switch_off', 'sleep_worry', 'escape_thoughts'],
          'Coping Behaviors': ['distractions', 'unhealthy_soothing', 'stimulants', 'conceal_deadlines']
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