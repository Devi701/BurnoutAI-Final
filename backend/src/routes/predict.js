const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { predictAndAdvise } = require('../services/predictionService');
const db = require('../config/database');

async function calculateDailyAdjustment(userId, features, baseline) {
  let continuousAdjustment = 0;
  let baselineTip = null;

  // Fetch recent history
  const history = await db.Checkin.findAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    limit: 14 // Look back 2 weeks
  });

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

  let fatigueBank = 0;
  let resilienceBank = 0;
  let sleepSum = 0;
  let sleepCount = 0;
  let lastStress = null;
  let volatility = 0;

  const chronological = [...pastCheckins].reverse();
  
  chronological.forEach(day => {
    const dayDate = new Date(day.createdAt);
    const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
    
    const dailyLoad = (day.stress || 50) / 10;
    const dailyRecovery = ((day.energy || 50) / 10) + (isWeekend ? 2 : 0);

    if (dailyLoad > dailyRecovery) {
      fatigueBank += (dailyLoad - dailyRecovery) * 0.5;
      resilienceBank = Math.max(0, resilienceBank - (dailyLoad - dailyRecovery));
    } else {
      fatigueBank = Math.max(0, fatigueBank - (dailyRecovery - dailyLoad) * 0.3);
      resilienceBank = Math.min(20, resilienceBank + (dailyRecovery - dailyLoad) * 0.5);
    }

    if (day.sleepHours) {
      sleepSum += day.sleepHours;
      sleepCount++;
    }

    if (lastStress !== null) {
      volatility += Math.abs(day.stress - lastStress);
    }
    lastStress = day.stress;
  });

  const avgSleep = sleepCount > 0 ? sleepSum / sleepCount : 7;
  if (avgSleep < 6 || (features.sleepQuality && features.sleepQuality < 3)) {
    features.stress = Math.min(100, features.stress * 1.1); 
  }

  features.stress = Math.min(100, features.stress + (fatigueBank * 2));
  continuousAdjustment += fatigueBank;
  continuousAdjustment -= resilienceBank;

  const avgVolatility = sleepCount > 1 ? volatility / (sleepCount - 1) : 0;
  if (avgVolatility > 2) continuousAdjustment += avgVolatility;

  if (baseline) {
    const daysSince = Math.floor((Date.now() - new Date(baseline.createdAt)) / (1000 * 60 * 60 * 24));
    if (daysSince > 21) {
      baselineTip = "It's been a few weeks. Please retake the Full Assessment to track your improvement.";
    }
    continuousAdjustment += (baseline.score > 50 ? 10 : -10);
  }

  return { continuousAdjustment, baselineTip };
}

function calculateFullAssessmentScore(features) {
  const config = {
    boundaries_yes: { weight: 1, tip: "Practice saying 'no' to small requests first." },
    social_cancel: { weight: 1.2, tip: "Protect your personal time; isolation worsens burnout." },
    conceal_deadlines: { weight: 1.4, tip: "Transparency reduces anxiety. Communicate delays early." },
    escape_thoughts: { weight: 1.5, tip: "Consider speaking with a mentor about your career path." },
    distractions: { weight: 1, tip: "Use time-blocking to manage focus periods." },
    unhealthy_soothing: { weight: 1.5, tip: "Seek healthy coping mechanisms like exercise or talking to a friend." },
    no_breaks: { weight: 1.1, tip: "Set a timer for 5-minute breaks every hour." },
    skip_lunch: { weight: 1.1, tip: "Nutrition fuels resilience. Step away for lunch." },
    stimulants: { weight: 1, tip: "Reduce caffeine intake after noon to improve sleep." },
    hard_switch_off: { weight: 1.2, tip: "Create a transition ritual to separate work from home life." },
    sleep_worry: { weight: 1.3, tip: "Write down tomorrow's to-do list before bed to clear your mind." }
  };

  let weightedSum = 0;
  let maxPossibleWeighted = 0;
  let highSeverityCount = 0;
  let criticalCount = 0;
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
  const compoundingMultiplier = 1 + (Math.pow(highSeverityCount, 1.6) / 100);
  const criticalPenalty = Math.pow(criticalCount, 1.8) * 1.2;

  let finalScore = (baseScore * compoundingMultiplier) + criticalPenalty;
  const score = Math.min(100, Math.max(0, Math.round(finalScore)));
  const tips = activeTips.slice(0, 5);
  if (tips.length === 0) tips.push("You seem to be balancing well. Keep it up!");

  return { score, tips };
}

/**
 * @route   POST /
 * @desc    Get a burnout score prediction based on quiz answers.
 *          This route is mounted at /api/predict, so its full path is POST /api/predict.
 * @access  Public
 */
router.post('/', async (req, res) => {
  try {
    // Expect a body like: { type: 'small'|'full', features: { ... } }
    let { type = 'small', userId, features } = req.body;
    
    // Fallback if features are at root
    if (!features) features = req.body;

    // Security: Prevent IDOR if saving data
    if (userId && req.user.id !== Number.parseInt(userId, 10)) {
      return res.status(403).json({ error: 'Unauthorized.' });
    }

    let continuousAdjustment = 0;
    let baselineTip = null;

    // --- Advanced Continuous Prediction Logic (Daily Only) ---
    if (type === 'daily' && userId) {
      const baseline = await db.QuizResult.findOne({
        where: { 
          userId,
          quizType: { [Op.in]: ['full', 'small'] }
        },
        order: [['createdAt', 'DESC']]
      });

      const adj = await calculateDailyAdjustment(userId, features, baseline);
      continuousAdjustment = adj.continuousAdjustment;
      baselineTip = adj.baselineTip;
    }

    let result = { score: 0, tips: [] };

    if (type === 'full') {
      result = calculateFullAssessmentScore(features);
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
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;