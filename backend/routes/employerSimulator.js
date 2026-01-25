const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { Op } = require('sequelize');
const SimulationService = require('../services/simulationService');

// Placeholder for Employer Action Simulator
router.post('/simulate', async (req, res) => {
  try {
    const { companyCode, teamIds, plan } = req.body;
    // plan = { name, actions: [{ type, intensity, adherence }], durationWeeks }

    if (!companyCode) return res.status(400).json({ error: "Company code required" });

    // 1. Ingest Employee Data (Baseline)
    const whereClause = { companyCode, [Op.or]: [{ role: 'employee' }, { role: null }] };
    if (teamIds && teamIds.length > 0) {
      whereClause.teamId = { [Op.in]: teamIds };
    }

    const employees = await db.User.findAll({ 
      where: whereClause,
      attributes: ['id'] 
    });

    const employeeIds = employees.map(e => e.id);
    
    // Fetch last 30 days of checkins for baseline
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const checkins = await db.Checkin.findAll({
      where: { 
        userId: { [Op.in]: employeeIds },
        createdAt: { [Op.gte]: thirtyDaysAgo }
      },
      order: [['createdAt', 'ASC']]
    });

    // Calculate Baseline Averages per Employee
    const employeeBaselines = [];
    employeeIds.forEach(uid => {
      const userCheckins = checkins.filter(c => c.userId === uid);
      if (userCheckins.length > 0) {
        const sum = userCheckins.reduce((acc, c) => ({
          stress: acc.stress + c.stress,
          energy: acc.energy + c.energy,
          risk: acc.risk + (c.stress + (100 - c.energy)) / 2
        }), { stress: 0, energy: 0, risk: 0 });
        
        const count = userCheckins.length;
        employeeBaselines.push({
          stress: sum.stress / count,
          energy: sum.energy / count,
          risk: sum.risk / count
        });
      }
    });

    // If no data, use industry defaults
    if (employeeBaselines.length === 0) {
      employeeBaselines.push({ stress: 60, energy: 40, risk: 60 });
    }

    console.time('MonteCarloSimulation');
    // 2. Run Simulation via Service
    const { timeline, estimatedCost } = SimulationService.runMonteCarlo(employeeBaselines, plan);
    console.timeEnd('MonteCarloSimulation');

    // 3. Compute Derived Metrics
    const startRisk = timeline[0].risk;
    const endRisk = timeline[timeline.length - 1].risk;
    const delta = startRisk - endRisk;
    const deltaPercent = (delta / startRisk) * 100;
    
    // Time to Impact: Day where risk drops by 5%
    const impactDay = timeline.findIndex(t => t.risk < startRisk * 0.95);
    
    // Volatility (Standard Deviation of daily changes)
    const changes = timeline.map((t, i) => i === 0 ? 0 : t.risk - timeline[i-1].risk);
    const meanChange = changes.reduce((a,b) => a+b, 0) / changes.length;
    const variance = changes.reduce((a,b) => a + Math.pow(b - meanChange, 2), 0) / changes.length;
    const volatility = Math.sqrt(variance);

    res.json({
      timeline,
      metrics: {
        deltaPercent: deltaPercent.toFixed(1),
        timeToImpact: impactDay > -1 ? impactDay : null,
        volatility: volatility.toFixed(2),
        trend: delta > 0 ? 'Improving' 
             : delta < 0 ? 'Worsening' 
             : 'Flat',
        estimatedCost: Math.round(estimatedCost || 0),
        projectDeadline: plan.projectDeadline || null
      }
    });

  } catch (error) {
    console.error("Simulation error:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;