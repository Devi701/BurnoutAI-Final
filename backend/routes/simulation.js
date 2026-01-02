const express = require('express');
const router = express.Router();
const db = require('../db/database');

// Helper: Calculate burnout risk (0-10)
// Formula: (Stress + Workload + (10 - Sleep)) / 3
const calculateRisk = (checkin) => {
  if (!checkin) return 0;
  const stress = checkin.stress || 0;
  const workload = checkin.workload || 0;
  const sleep = checkin.sleep || 0;
  const fatigue = Math.max(0, 10 - sleep);
  // Weighted model: Stress (40%), Workload (30%), Fatigue (30%)
  return (stress * 0.4 + workload * 0.3 + fatigue * 0.3);
};

router.post('/simulate', async (req, res) => {
  try {
    const { teamIds, action, companyCode } = req.body;

    if (!teamIds || !Array.isArray(teamIds) || teamIds.length === 0) {
      return res.status(400).json({ error: 'Please select at least one team.' });
    }

    // Fetch Teams
    const teams = await db.sequelize.query(
      `SELECT * FROM Teams WHERE id IN (:teamIds) AND companyCode = :companyCode`,
      { replacements: { teamIds, companyCode }, type: db.sequelize.QueryTypes.SELECT }
    );

    const results = [];
    let orgCurrentTotal = 0;
    let orgProjectedTotal = 0;
    let totalEmployees = 0;

    for (const team of teams) {
      // Get employees for this team
      const employees = await db.sequelize.query(
        `SELECT id FROM Users WHERE teamId = :teamId`,
        { replacements: { teamId: team.id }, type: db.sequelize.QueryTypes.SELECT }
      );
      
      if (employees.length === 0) continue;

      let teamCurrentRiskSum = 0;
      let teamProjectedRiskSum = 0;
      let employeeCount = 0;

      for (const emp of employees) {
        // Get latest checkin
        const [checkin] = await db.sequelize.query(
          `SELECT * FROM checkins WHERE userId = :userId ORDER BY date DESC LIMIT 1`,
          { replacements: { userId: emp.id }, type: db.sequelize.QueryTypes.SELECT }
        );

        if (!checkin) continue;

        employeeCount++;
        const currentRisk = calculateRisk(checkin);
        
        // Apply Simulation Logic based on Action
        let projectedStress = checkin.stress;
        let projectedWorkload = checkin.workload;
        let projectedSleep = checkin.sleep;

        // 1. Define Individual Sensitivity & Inertia
        // People with high stress (>8) have 'inertia' - it's harder to lower their stress quickly.
        const inertia = projectedStress > 8 ? 0.2 : 0;

        switch (action) {
          case 'reduce_workload_10':
            // Impact scales with magnitude of workload
            const w_drop = projectedWorkload * 0.10;
            projectedWorkload = Math.max(0, projectedWorkload - w_drop);
            
            // Stress reduction depends on sleep resilience. Better sleep = better stress recovery.
            const resilience = (projectedSleep / 10); // 0..1
            projectedStress = Math.max(0, projectedStress - (w_drop * (0.8 + resilience * 0.4) * (1 - inertia)));
            break;
          case 'add_resources':
            // Significant workload drop (20%)
            const res_drop = projectedWorkload * 0.20;
            projectedWorkload = Math.max(0, projectedWorkload - res_drop);
            
            // Stress drops, assuming resources take time to onboard (efficiency factor 0.9)
            projectedStress = Math.max(0, projectedStress - (res_drop * 0.9 * (1 - inertia)));
            break;
          case 'recovery_program':
            // Diminishing returns on sleep: Hard to improve beyond 9 hours.
            if (projectedSleep < 7) {
                projectedSleep += 1.5; // Big boost for deprived
            } else if (projectedSleep < 9) {
                projectedSleep += 0.5; // Small boost for okay sleepers
            }
            // Direct stress reduction technique
            projectedStress = Math.max(0, projectedStress * 0.85);
            break;
          case 'optimize_meetings':
             // Reduces workload slightly (time back)
             projectedWorkload = Math.max(0, projectedWorkload * 0.90);
             // Reduces stress significantly due to less context switching
             projectedStress = Math.max(0, projectedStress - 1.0);
             break;
          default:
            break;
        }

        // 2. System Dynamics (Feedback Loops)
        // Loop A: Workload Floor - Stress unlikely to drop far below workload level
        if (projectedStress < projectedWorkload * 0.5) {
            projectedStress = (projectedStress + projectedWorkload * 0.5) / 2;
        }
        // Loop B: Sleep-Stress Feedback
        if (projectedStress > 8) projectedSleep = Math.max(0, projectedSleep - 0.5); // Anxiety
        if (projectedSleep > 8) projectedStress = Math.max(0, projectedStress * 0.95); // Resilience

        // Clamp values
        projectedStress = Math.min(10, Math.max(0, projectedStress));
        projectedWorkload = Math.min(10, Math.max(0, projectedWorkload));
        projectedSleep = Math.min(10, Math.max(0, projectedSleep));

        const projectedRisk = calculateRisk({ 
          stress: projectedStress, 
          workload: projectedWorkload, 
          sleep: projectedSleep 
        });

        teamCurrentRiskSum += currentRisk;
        teamProjectedRiskSum += projectedRisk;
      }

      if (employeeCount > 0) {
        results.push({
          teamId: team.id,
          name: team.name,
          currentAvg: (teamCurrentRiskSum / employeeCount).toFixed(2),
          projectedAvg: (teamProjectedRiskSum / employeeCount).toFixed(2),
          memberCount: employeeCount
        });
        
        orgCurrentTotal += teamCurrentRiskSum;
        orgProjectedTotal += teamProjectedRiskSum;
        totalEmployees += employeeCount;
      }
    }

    const orgMetrics = {
      currentAvg: totalEmployees > 0 ? (orgCurrentTotal / totalEmployees).toFixed(2) : 0,
      projectedAvg: totalEmployees > 0 ? (orgProjectedTotal / totalEmployees).toFixed(2) : 0,
      improvement: totalEmployees > 0 ? (((orgCurrentTotal - orgProjectedTotal) / orgCurrentTotal) * 100).toFixed(1) : 0
    };

    res.json({ teams: results, org: orgMetrics });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;