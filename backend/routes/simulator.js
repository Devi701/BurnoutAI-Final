const express = require('express');
const router = express.Router();
const { DataTypes, Op } = require('sequelize');
const db = require('../db/database');
const { predictAndAdvise } = require('../services/predictionService');

// PostHog Backend Initialization
let posthog = null;
try {
  const PostHog = require('posthog-node').PostHog;
  if (process.env.POSTHOG_KEY) {
    posthog = new PostHog(process.env.POSTHOG_KEY, { host: 'https://eu.posthog.com' });
  }
} catch (e) { console.log('PostHog not configured in simulator.'); }

// Define ActionPlan model dynamically if db.sequelize is available
// Note: In a full production app, this should be in /models/ActionPlan.js and imported in database.js
let ActionPlan;
if (db && db.sequelize) {
  ActionPlan = db.sequelize.define('ActionPlan', {
    userId: { type: DataTypes.INTEGER, allowNull: false },
    actions: { type: DataTypes.JSON, allowNull: false }, // Stores the array of actions
    baselineScore: { type: DataTypes.INTEGER },
    projectedScore: { type: DataTypes.INTEGER },
    changePercent: { type: DataTypes.INTEGER },
    trend: { type: DataTypes.JSON },
  });

  db.sequelize.define('ActionPlanTracking', {
    userId: { type: DataTypes.INTEGER, allowNull: false },
    planId: { type: DataTypes.INTEGER, allowNull: false },
    date: { type: DataTypes.STRING, allowNull: false },
    data: { type: DataTypes.JSON, allowNull: false }
  });
}

// Updated to 90 days (3 months) per request
const SIMULATION_DAYS = 90;
const SMOOTHING = 0.2; // Inertia factor: Burnout doesn't change instantly
const NUM_SIMULATIONS = 50; // 2. Monte Carlo: Run multiple times to average noise

// POST /api/action-impact
// Calculates how specific actions change burnout risk
router.post('/', async (req, res) => {
  try {
    const { userId, actions } = req.body;

    // Security: Prevent IDOR
    if (req.user.id !== parseInt(userId, 10)) {
      return res.status(403).json({ error: 'Unauthorized.' });
    }

    // 1. Validate Inputs
    if (!userId) {
      console.error('Simulator Error: Missing userId');
      return res.status(400).json({ error: "User ID is required." });
    }
    if (!actions || !Array.isArray(actions)) {
      console.error('Simulator Error: Invalid actions array', actions);
      return res.status(400).json({ error: "Actions array is required." });
    }

    // 2. Get Baseline (Average of last 7 check-ins)
    const recentCheckins = await db.Checkin.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: 7
    });

    if (!recentCheckins || recentCheckins.length === 0) {
       return res.status(400).json({ error: "Complete at least one daily check-in to establish a baseline." });
    }

    const sum = recentCheckins.reduce((acc, c) => ({
      stress: acc.stress + c.stress,
      sleep: acc.sleep + c.sleep,
      workload: acc.workload + c.workload,
      coffee: acc.coffee + c.coffee
    }), { stress: 0, sleep: 0, workload: 0, coffee: 0 });

    const count = recentCheckins.length;
    const baselineFeatures = {
      stress: sum.stress / count,
      sleep: sum.sleep / count,
      workload: sum.workload / count,
      coffee: sum.coffee / count
    };

    // Get current baseline score
    const baselinePred = await predictAndAdvise('daily', baselineFeatures);
    const baselineScore = Math.round(baselinePred.score);

    // 3. Simulation Loop (Monte Carlo)
    // We simulate 30 days multiple times and average the results
    const dailySums = new Array(SIMULATION_DAYS).fill(0);
    
    // Helper for random daily noise (variance +/- 0.5)
    const noise = () => (Math.random() * 1.0) - 0.5;

    for (let sim = 0; sim < NUM_SIMULATIONS; sim++) {
      let currentScore = baselineScore; 
      let fatigueBank = 0;

      for (let day = 1; day <= SIMULATION_DAYS; day++) {
        // 1. Start with baseline + natural daily variance
        let dailyStress = baselineFeatures.stress + noise();
        let dailySleep = baselineFeatures.sleep + noise();
        let dailyWorkload = baselineFeatures.workload + noise();
        let dailyCoffee = baselineFeatures.coffee; // Habits tend to be stable

        // 2. Apply Weekend Effect (Cyclicality)
        // Assume simulation starts tomorrow. Days 6, 7, 13, 14... are weekends.
        const isWeekend = (day % 7 === 6) || (day % 7 === 0);
        if (isWeekend) {
          dailyWorkload *= 0.3; // Workload drops significantly
          dailyStress *= 0.85;  // Natural recovery
        }

        // 3. Apply User Actions (Interventions)
        actions.forEach(action => {
          const val = Number(action.value);
          switch (action.type) {
            case 'vacation_days':
              if (day <= val) {
                // 3. Non-Linear Saturation (Sigmoid-like) for Vacation
                // It takes time to unwind. Day 1 is less relaxing than Day 3.
                // Multiplier drops from 0.7 to 0.4 over time
                const daysIntoVacation = day;
                const relaxFactor = 0.4 + (0.3 * Math.exp(-0.5 * daysIntoVacation));
                dailyStress *= relaxFactor; 
                dailyWorkload = 0;
              } else {
                // Post-vacation fade (return to normal over 5 days)
                const daysSince = day - val;
                if (daysSince <= 5) {
                  const recoveryFactor = daysSince / 5; // 0 to 1
                  // Linearly interpolate back to normal
                  dailyStress = (dailyStress * 0.4) + (dailyStress * 0.6 * recoveryFactor);
                  dailyWorkload = (dailyWorkload * recoveryFactor);
                }
              }
              break;
            case 'sleep_hours':
              dailySleep = val; // Direct intervention
              break;
            case 'workload_reduction':
              dailyWorkload *= (1 - val / 100);
              break;
            case 'boundary_hour':
              // Earlier boundaries prevent evening stress spikes (e.g. 17:00 vs 22:00)
              dailyStress -= ((22 - val) * 0.4);
              break;
            case 'movement_sessions':
              // 3. Non-Linear Saturation (Sigmoid)
              // Diminishing returns: Going from 0 to 3 sessions helps a lot; 6 to 7 helps little.
              // Formula: MaxReduction * (1 - e^(-k * sessions))
              const reduction = 2.5 * (1 - Math.exp(-0.3 * val));
              dailyStress -= reduction;
              break;
            case 'social_minutes':
              // Social Connection Buffering
              // 30 mins = ~0.7 reduction, 60 mins = ~1.0 reduction (diminishing returns)
              const socialReduction = 1.5 * (1 - Math.exp(-0.02 * val));
              dailyStress -= socialReduction;
              break;
          }
        });

        // 4. Apply System Dynamics (Inter-dependencies) - The "Realistic" Layer
        
        // A. Sleep <-> Stress Feedback
        if (dailySleep < 6) {
          dailyStress += (6 - dailySleep) * 0.8; // Poor sleep increases stress sensitivity
        }
        if (dailyStress > 8) {
          dailySleep -= 0.5; // High stress impacts sleep quality
        }

        // B. Coffee -> Sleep
        if (dailyCoffee > 4) {
          dailySleep -= (dailyCoffee - 4) * 0.4; // Too much coffee hurts sleep
        }

        // 4. Circadian Misalignment Penalty
        // Working late degrades sleep quality (effective sleep hours)
        const boundaryAction = actions.find(a => a.type === 'boundary_hour');
        if (boundaryAction && boundaryAction.value > 21) {
          // Penalty: Lose 0.5 effective hours for every hour past 9pm
          const penalty = (boundaryAction.value - 21) * 0.5;
          dailySleep = Math.max(0, dailySleep - penalty);
        }

        // C. Cumulative Fatigue (Burnout Debt)
        // Calculate daily load vs recovery capacity
        const dailyLoad = dailyStress + dailyWorkload;
        const dailyRecovery = dailySleep + (isWeekend ? 5 : 2); // Weekends offer more natural recovery

        if (dailyLoad > dailyRecovery) {
          fatigueBank += (dailyLoad - dailyRecovery) * 0.5; // Add to debt
        } else {
          fatigueBank = Math.max(0, fatigueBank - (dailyRecovery - dailyLoad) * 0.3); // Pay down debt slowly
        }

        // If debt is high, it adds a "drag" on the stress score (harder to lower stress)
        dailyStress += Math.min(5, fatigueBank * 0.5);

        // Clamp values to realistic bounds
        dailyStress = Math.max(1, Math.min(10, dailyStress));
        dailySleep = Math.max(0, Math.min(12, dailySleep));
        dailyWorkload = Math.max(1, Math.min(10, dailyWorkload));

        const pred = await predictAndAdvise('daily', {
          stress: dailyStress,
          sleep: dailySleep,
          workload: dailyWorkload,
          coffee: dailyCoffee
        });
        
        // Apply smoothing to show gradual change
        currentScore = (currentScore * (1 - SMOOTHING)) + (pred.score * SMOOTHING);
        
        // Accumulate for Monte Carlo averaging
        dailySums[day - 1] += currentScore;
      }
    }

    // Average the trends from all simulations
    const trend = dailySums.map((sum, index) => ({
      day: index + 1,
      score: Math.round(sum / NUM_SIMULATIONS)
    }));

    const projectedScore = trend[trend.length - 1].score;

    // 5. Calculate Results
    const diff = projectedScore - baselineScore;
    const overallChange = baselineScore !== 0 ? Math.round((diff / baselineScore) * 100) : 0;

    const recommendation = diff < 0 
      ? `These actions could reduce your burnout risk by ${Math.abs(overallChange)}%. Great choices!`
      : "These changes might not significantly lower your risk. Try prioritizing sleep or workload reduction.";

    res.json({
      baselineScore,
      projectedScore,
      changePercent: overallChange,
      trend,
      recommendation,
      appliedActions: actions
    });

    // --- Analytics Tracking ---
    if (posthog) {
      try {
        const user = await db.User.findByPk(userId);
        if (user) {
          posthog.capture({
            distinctId: String(userId),
            event: 'simulator_run',
            properties: {
              baseline_score: baselineScore,
              projected_score: projectedScore,
              change_percent: overallChange
            }
          });
        }
      } catch (err) { console.error('Analytics error:', err.message); }
    }

  } catch (error) {
    console.error('Simulator Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/action-impact/save
// Saves a selected action plan to the user's profile
router.post('/save', async (req, res) => {
  try {
    const { userId, actions, baselineScore, projectedScore, changePercent, trend } = req.body;

    if (!ActionPlan) {
      return res.status(500).json({ error: 'ActionPlan model not initialized.' });
    }

    const plan = await ActionPlan.create({
      userId,
      actions,
      baselineScore,
      projectedScore,
      changePercent,
      trend
    });

    // --- Analytics Tracking ---
    if (posthog) {
      try {
        const user = await db.User.findByPk(userId);
        if (user) {
          posthog.capture({
            distinctId: String(userId),
            event: 'action_plan_saved',
            properties: { change_percent: changePercent }
          });
        }
      } catch (err) { console.error('Analytics error:', err.message); }
    }

    res.json({ message: 'Action plan saved successfully.', plan });
  } catch (error) {
    console.error('Save plan error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/action-impact/history/:userId
// Fetches saved action plans for a user
router.get('/history/:userId', async (req, res) => {
  try {
    const plans = await ActionPlan.findAll({
      where: { userId: req.params.userId },
      order: [['createdAt', 'ASC']] // Oldest to newest for graph
    });
    res.json(plans);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/action-impact/track
// Saves daily adherence for an action plan
router.post('/track', async (req, res) => {
  try {
    const { userId, planId, date, data } = req.body;
    const Tracking = db.sequelize.models.ActionPlanTracking;
    
    // Upsert tracking record
    const existing = await Tracking.findOne({ where: { userId, planId, date } });
    if (existing) {
      existing.data = data;
      await existing.save();
      return res.json(existing);
    }
    const newTracking = await Tracking.create({ userId, planId, date, data });
    res.json(newTracking);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/action-impact/tracking/:planId
router.get('/tracking/:planId', async (req, res) => {
  try {
    const Tracking = db.sequelize.models.ActionPlanTracking;
    const history = await Tracking.findAll({ where: { planId: req.params.planId } });
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;