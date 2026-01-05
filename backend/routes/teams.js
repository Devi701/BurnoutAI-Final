const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /api/teams?companyCode=XYZ
router.get('/', async (req, res) => {
  try {
    const { companyCode } = req.query;
    if (!companyCode) return res.status(400).json({ error: 'Company code required' });
    
    const teams = await db.sequelize.query(
      `SELECT * FROM Teams WHERE companyCode = :companyCode`,
      { replacements: { companyCode }, type: db.sequelize.QueryTypes.SELECT }
    );
    res.json(teams);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/teams
router.post('/', async (req, res) => {
  try {
    const { name, companyCode } = req.body;
    if (!name || !companyCode) return res.status(400).json({ error: 'Name and Company Code required' });

    const [id] = await db.sequelize.query(
      `INSERT INTO Teams (name, companyCode, createdAt, updatedAt) VALUES (:name, :companyCode, datetime('now'), datetime('now'))`,
      { replacements: { name, companyCode }, type: db.sequelize.QueryTypes.INSERT }
    );

    const [team] = await db.sequelize.query(
      `SELECT * FROM Teams WHERE id = :id`,
      { replacements: { id }, type: db.sequelize.QueryTypes.SELECT }
    );
    res.json(team);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/teams/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Team ID required' });

    // Unassign users first
    await db.sequelize.query(`UPDATE Users SET teamId = NULL WHERE teamId = :id`, { replacements: { id } });
    // Delete team
    await db.sequelize.query(`DELETE FROM Teams WHERE id = :id`, { replacements: { id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/teams/assign
router.post('/assign', async (req, res) => {
  try {
    const { userId, teamId } = req.body;
    const safeTeamId = (teamId === undefined || teamId === null) ? null : parseInt(teamId, 10);
    await db.sequelize.query(
      `UPDATE Users SET teamId = :teamId WHERE id = :userId`,
      { replacements: { userId, teamId: safeTeamId } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: Calculate burnout risk (0-10)
const calculateRisk = (checkin) => {
  if (!checkin) return 0;
  const stress = Number(checkin.stress || 0);
  const workload = Number(checkin.workload || 0);
  const sleep = Number(checkin.sleep || 0);
  const fatigue = Math.max(0, 10 - sleep);
  return (stress * 0.4 + workload * 0.3 + fatigue * 0.3);
};

// POST /api/teams/simulate
router.post('/simulate', async (req, res) => {
  try {
    const { teamIds, companyCode } = req.body;

    if (!teamIds || !Array.isArray(teamIds) || teamIds.length === 0) {
      return res.status(400).json({ error: 'Please select at least one team.' });
    }

    // 1. Fetch Teams & Employees
    const teams = await db.sequelize.query(
      `SELECT * FROM Teams WHERE companyCode = ? AND id IN (${teamIds.map(() => '?').join(',')})`,
      { replacements: [companyCode, ...teamIds], type: db.sequelize.QueryTypes.SELECT }
    );

    const allEmployees = await db.sequelize.query(
      `SELECT id, teamId FROM Users WHERE companyCode = :companyCode AND (role = 'employee' OR role IS NULL)`,
      { replacements: { companyCode }, type: db.sequelize.QueryTypes.SELECT }
    );

    // 2. Calculate Baseline Metrics
    let totalRiskSum = 0;
    let totalWorkloadSum = 0; // 0-10 scale
    let employeeCount = 0;
    
    // We'll assume a standard 40h work week for "Hours" calculation
    const HOURS_PER_WEEK = 40;

    // Collect all relevant checkins for simulation
    const simulationPopulation = [];
    
    for (const team of teams) {
      const employees = allEmployees.filter(e => e.teamId && String(e.teamId) === String(team.id));
      for (const emp of employees) {
        try {
          const [checkin] = await db.sequelize.query(
            `SELECT * FROM checkins WHERE userId = :userId ORDER BY createdAt DESC LIMIT 1`,
            { replacements: { userId: emp.id }, type: db.sequelize.QueryTypes.SELECT }
          );
          if (!checkin) continue;

          const currentRisk = calculateRisk(checkin);
          totalRiskSum += currentRisk;
          totalWorkloadSum += Number(checkin.workload || 0);
          employeeCount++;
          
          simulationPopulation.push({
            risk: currentRisk,
            stress: Number(checkin.stress || 0),
            workload: Number(checkin.workload || 0),
            sleep: Number(checkin.sleep || 0)
          });
        } catch (innerErr) {
          console.error(`Error processing employee ${emp.id}:`, innerErr);
          // Continue to next employee
        }
      }
    }

    if (employeeCount === 0) {
      return res.status(400).json({ error: 'No active employees found in selected teams. Ensure employees are assigned and have check-in data.' });
    }

    const baselineRisk = totalRiskSum / employeeCount;
    const baselineWorkload = totalWorkloadSum / employeeCount;
    const totalHours = employeeCount * HOURS_PER_WEEK;

    // 3. Define Actions and Generate Curves
    // We generate data points for slider values 0, 25, 50, 75, 100
    const steps = [0, 25, 50, 75, 100];
    
    const actionsDef = [
      {
        id: 'reduce_workload',
        title: 'Reduce Workload',
        desc: 'Decrease assigned tasks per employee.',
        unit: '%',
        max: 100,
        // Logic: Risk reduces linearly. Hours "lost" (capacity gap) increases.
        calc: (val, p) => {
          // Dynamic Sensitivity: Impact depends on how high the workload actually is
          const sensitivity = Math.pow(p.workload / 5, 1.5); 
          return {
            risk: p.risk * (1 - (0.006 * val * sensitivity)), 
            hours: (val / 100) * HOURS_PER_WEEK // Hours lost per person
          };
        },
        optimal: 20 // Recommendation
      },
      {
        id: 'recovery_prompts',
        title: 'Recovery Prompts',
        desc: 'Frequency of mandatory break reminders.',
        unit: 'freq/day',
        max: 10,
        // Logic: Risk reduces with diminishing returns. Minimal time cost.
        calc: (val, p) => {
          // Dynamic Sensitivity: High stress makes breaks more valuable
          const sensitivity = Math.max(0.5, p.stress / 5);
          return {
            risk: p.risk * (1 - (0.02 * val * (1 - val/20) * sensitivity)), 
            hours: (val * 0.1) // 6 mins per prompt
          };
        },
        optimal: 4
      },
      {
        id: 'temp_support',
        title: 'Temporary Support',
        desc: 'Add external resources (hours/week).',
        unit: 'hrs',
        max: 40,
        // Logic: High risk reduction. Negative "Extra Hours" (Capacity Gain).
        calc: (val, p) => {
          // Dynamic Sensitivity: Helps most when workload is high
          const sensitivity = Math.pow(p.workload / 5, 1.2);
          return {
            risk: p.risk * (1 - (0.015 * val * sensitivity)),
            hours: -val // Gain capacity
          };
        },
        optimal: 10
      },
      {
        id: 'flexible_hours',
        title: 'Flexible Hours',
        desc: 'Percentage of schedule autonomy.',
        unit: '%',
        max: 100,
        // Logic: Moderate risk reduction, zero cost.
        calc: (val, p) => {
          // Dynamic Sensitivity: Autonomy helps reduce stress
          const sensitivity = Math.max(0.8, p.stress / 6);
          return {
            risk: p.risk * (1 - (0.003 * val * sensitivity)),
            hours: 0
          };
        },
        optimal: 100
      },
      {
        id: 'training_sessions',
        title: 'Wellbeing Training',
        desc: 'Sessions per month.',
        unit: 'sess/mo',
        max: 8,
        // Logic: Good reduction, high time cost.
        calc: (val, p) => {
           // Dynamic Sensitivity: Helps with coping (stress) and sleep hygiene
           const sensitivity = (p.stress + (10 - p.sleep)) / 12;
           return {
            risk: p.risk * (1 - (0.04 * val * sensitivity)),
            hours: val * 1.5 // 1.5 hours per session
          };
        },
        optimal: 2
      },
      {
        id: 'adjust_deadlines',
        title: 'Extend Deadlines',
        desc: 'Push back deadlines by days.',
        unit: 'days',
        max: 14,
        calc: (val, p) => {
          // Dynamic Sensitivity: Helps when workload/stress is high
          const sensitivity = (p.workload + p.stress) / 10;
          return {
            risk: p.risk * (1 - (0.02 * val * sensitivity)),
            hours: 0 // No direct hour cost, but delay (not modeled here)
          };
        },
        optimal: 5
      }
    ];

    const simulationData = actionsDef.map(action => {
      const curve = steps.map(stepVal => {
        // Map step (0-100 scale) to actual unit value
        const actualVal = (stepVal / 100) * action.max;
        
        let stepRiskSum = 0;
        let stepHoursSum = 0;

        simulationPopulation.forEach(p => {
          const res = action.calc(actualVal, p);
          stepRiskSum += res.risk;
          stepHoursSum += res.hours;
        });

        return {
          step: stepVal, // 0-100 for x-axis
          value: actualVal, // Actual unit value
          avgRisk: stepRiskSum / employeeCount,
          totalExtraHours: stepHoursSum // Total for team
        };
      });

      return {
        id: action.id,
        title: action.title,
        desc: action.desc,
        unit: action.unit,
        max: action.max,
        optimal: (action.optimal / action.max) * 100, // Normalized 0-100 for slider
        curve
      };
    });

    res.json({
      baseline: {
        risk: baselineRisk,
        workload: baselineWorkload,
        totalHours
      },
      actions: simulationData,
      employeeCount
    });

  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;