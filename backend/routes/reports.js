const express = require('express');
const router = express.Router();
const { Op, DataTypes } = require('sequelize');
const db = require('../db/database');
const { predictAndAdvise } = require('../services/predictionService');

// GET /api/reports/personal/me
// Returns personal history with NUANCED projections (Seasonality + Trend)
router.get('/personal/me', async (req, res) => {
  try {
    const { userId, startDate, endDate } = req.query;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    // Build query options
    const where = { userId };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // Include the full end day
        where.createdAt[Op.lte] = end;
      }
    }

    const queryOptions = { where, order: [['createdAt', 'ASC']] };
    // Default to last 60 days if no range is specified
    if (!startDate && !endDate) queryOptions.limit = 60;

    // 1. Fetch History
    const rawCheckins = await db.Checkin.findAll(queryOptions);

    // Deduplicate: Keep only the latest check-in per calendar day
    const checkinsMap = new Map();
    for (const c of rawCheckins) {
      const dateKey = new Date(c.createdAt).toDateString();
      checkinsMap.set(dateKey, c); // Map preserves insertion order, updates value
    }
    const checkins = Array.from(checkinsMap.values());

    // Calculate Streak
    let streak = 0;
    if (checkins.length > 0) {
      const sorted = [...checkins].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      const today = new Date();
      today.setHours(0,0,0,0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const last = new Date(sorted[sorted.length - 1].createdAt);
      last.setHours(0,0,0,0);

      if (last.getTime() === today.getTime() || last.getTime() === yesterday.getTime()) {
        streak = 1;
        let prevDate = last;
        for (let i = sorted.length - 2; i >= 0; i--) {
          const curr = new Date(sorted[i].createdAt);
          curr.setHours(0,0,0,0);
          const diff = (prevDate - curr) / (1000 * 60 * 60 * 24);
          if (diff === 1) {
            streak++;
            prevDate = curr;
          } else if (diff > 1) {
            break;
          }
        }
      }
    }

    // Check for existing baseline assessment
    const baseline = await db.QuizResult.findOne({ 
      where: { 
        userId,
        quizType: { [Op.in]: ['full', 'small'] }
      },
      order: [['createdAt', 'DESC']]
    });

    const labels = [];
    const dates = [];
    const riskData = [];
    const stressData = [];
    const sleepData = [];
    const workloadData = [];
    const coffeeData = [];
    const recentActivity = [];

    // Store processed points for analysis
    const historyPoints = [];

    // State for continuous logic (mirroring predict.js)
    let fatigueBank = 0;
    let resilienceBank = 0;
    const recentHistoryBuffer = []; // To mimic the 14-day window

    for (const c of checkins) {
      // 1. Calculate State based on recent history (buffer)
      let sleepSum = 0;
      let sleepCount = 0;
      let volatilitySum = 0;
      let prevStressForVol = null;

      for (const h of recentHistoryBuffer) {
        sleepSum += h.sleep;
        sleepCount++;
        if (prevStressForVol !== null) {
          volatilitySum += Math.abs(h.stress - prevStressForVol);
        }
        prevStressForVol = h.stress;
      }

      // 2. Prepare features for prediction (Apply State)
      const features = {
        stress: c.stress,
        sleep: c.sleep,
        workload: c.workload,
        coffee: c.coffee
      };

      let continuousAdjustment = 0;

      // A. Sleep Debt
      const avgSleep = sleepCount > 0 ? sleepSum / sleepCount : 8;
      if (avgSleep < 6) {
        features.stress = Math.min(10, features.stress * 1.2);
      }

      // B. Cumulative Fatigue (Input Mod)
      features.stress = Math.min(10, features.stress + (fatigueBank * 0.3));

      // C. Cumulative Fatigue (Direct Penalty)
      continuousAdjustment += fatigueBank;

      // C2. Resilience Bonus
      continuousAdjustment -= resilienceBank;

      // D. Volatility Penalty
      const avgVolatility = sleepCount > 1 ? volatilitySum / (sleepCount - 1) : 0;
      if (avgVolatility > 2) continuousAdjustment += avgVolatility;

      // E. Baseline Bias
      if (baseline) {
        const baselineShift = (baseline.score - 50) * 0.2;
        continuousAdjustment += baselineShift;
      }

      // Re-calculate score to ensure consistency across reports
      const pred = await predictAndAdvise('daily', features);
      
      let finalScore = pred.score + continuousAdjustment;
      finalScore = Math.min(100, Math.max(0, finalScore));
      
      const dateObj = new Date(c.createdAt);
      const dateStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      
      labels.push(dateStr);
      dates.push(c.createdAt);
      riskData.push(Math.round(finalScore));
      stressData.push(c.stress);
      sleepData.push(c.sleep);
      workloadData.push(c.workload);
      coffeeData.push(c.coffee);

      historyPoints.push({
        date: c.createdAt,
        score: finalScore,
        stress: c.stress,
        sleep: c.sleep,
        workload: c.workload,
        coffee: c.coffee,
        dayOfWeek: dateObj.getDay() // 0 (Sun) - 6 (Sat)
      });

      recentActivity.unshift({
        id: c.id,
        date: c.createdAt,
        stress: c.stress,
        note: c.note
      });

      // 3. Update State for NEXT iteration (using raw c)
      const dayDate = new Date(c.createdAt);
      const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
      const dailyLoad = c.stress + c.workload;
      const dailyRecovery = c.sleep + (isWeekend ? 4 : 2);

      if (dailyLoad > dailyRecovery) {
        fatigueBank += (dailyLoad - dailyRecovery) * 0.5;
        resilienceBank = Math.max(0, resilienceBank - (dailyLoad - dailyRecovery));
      } else {
        fatigueBank = Math.max(0, fatigueBank - (dailyRecovery - dailyLoad) * 0.3);
        resilienceBank = Math.min(20, resilienceBank + (dailyRecovery - dailyLoad) * 0.5);
      }

      // Update buffer
      recentHistoryBuffer.push(c);
      if (recentHistoryBuffer.length > 14) recentHistoryBuffer.shift();
    }

    // 2. NUANCED PROJECTION ALGORITHM
    // Goal: Project individual features first (Stress, Sleep, etc.) then predict risk from them.
    
    const projectionDays = 7;
    const projectionLabels = [];

    // Helper to project a specific metric (stress, sleep, etc.) using Seasonality + Trend
    const projectMetric = (key) => {
      const projectedValues = [];
      const upper = [];
      const lower = [];
      let stdDev = 1; // Default volatility
      
      if (historyPoints.length >= 7) {
        // A. Seasonality (Day of Week Bias)
        const dayBias = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
        const dayCounts = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };

        // Use a moving average to detrend the data before finding seasonality
        for (let i = 3; i < historyPoints.length - 3; i++) {
          const window = historyPoints.slice(i-3, i+4);
          const avg = window.reduce((sum, p) => sum + p[key], 0) / window.length;
          
          const point = historyPoints[i];
          const deviation = point[key] - avg;
          
          dayBias[point.dayOfWeek] += deviation;
          dayCounts[point.dayOfWeek]++;
        }

        // Normalize biases
        for (let d = 0; d <= 6; d++) {
          if (dayCounts[d] > 0) dayBias[d] /= dayCounts[d];
        }

        // B. Calculate Linear Trend (on last 14 days only)
        const trendWindow = historyPoints.slice(-14);
        let slope = 0;
        let intercept = 0;
        
        if (trendWindow.length > 1) {
          const n = trendWindow.length;
          let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
          trendWindow.forEach((p, i) => {
            sumX += i;
            sumY += p[key];
            sumXY += i * p[key];
            sumXX += i * i;
          });
          const denom = (n * sumXX - sumX * sumX);
          if (denom !== 0) {
            slope = (n * sumXY - sumX * sumY) / denom;
            intercept = (sumY - slope * sumX) / n;
          } else {
            intercept = sumY / n;
          }

          // Calculate Standard Error (volatility)
          const sumSqResiduals = trendWindow.reduce((acc, p, i) => {
            const pred = slope * i + intercept;
            return acc + Math.pow(p[key] - pred, 2);
          }, 0);
          stdDev = Math.sqrt(sumSqResiduals / (Math.max(1, n - 2)));
        } else if (trendWindow.length === 1) {
          intercept = trendWindow[0][key];
        }

        // C. Generate Projections
        const lastDate = new Date(historyPoints[historyPoints.length - 1].date);
        
        for (let i = 1; i <= projectionDays; i++) {
          const nextDate = new Date(lastDate);
          nextDate.setDate(lastDate.getDate() + i);
          const dayOfWeek = nextDate.getDay();

          // 1. Trend Component
          const x = (trendWindow.length - 1) + i;
          let val = (slope * x) + intercept;

          // 2. Seasonality Component
          val += dayBias[dayOfWeek];

          // 3. Clamping
          val = Math.max(0, val); // Ensure non-negative
          if (key === 'sleep') val = Math.min(24, val);
          else if (key !== 'coffee') val = Math.min(10, val); // Stress/Workload max 10

          projectedValues.push(val);

          // Confidence Interval
          const uncertainty = Math.max(0.5, stdDev) * (1 + (i * 0.2));
          let u = val + uncertainty;
          let l = val - uncertainty;

          // Clamp bounds
          u = Math.max(0, u);
          l = Math.max(0, l);
          if (key === 'sleep') u = Math.min(24, u);
          else if (key !== 'coffee') u = Math.min(10, u);

          upper.push(Math.round(u * 10) / 10);
          lower.push(Math.round(l * 10) / 10);
        }
      } else {
        // Fallback: Not enough data, repeat last value
        const lastVal = historyPoints.length > 0 ? historyPoints[historyPoints.length - 1][key] : 0;
        for(let i=0; i<projectionDays; i++) {
            projectedValues.push(lastVal);
            upper.push(lastVal);
            lower.push(lastVal);
        }
      }
      return { values: projectedValues, confidence: { upper, lower, volatility: stdDev } };
    };

    const projStressData = projectMetric('stress');
    const projSleepData = projectMetric('sleep');
    const projWorkloadData = projectMetric('workload');
    const projCoffeeData = projectMetric('coffee');

    const projectedRisk = [];
    const riskUpper = [];
    const riskLower = [];
    const lastDate = historyPoints.length > 0 ? new Date(historyPoints[historyPoints.length - 1].date) : new Date();

    // Calculate Standard Deviation of recent risk scores for confidence interval
    const recentRisk = riskData.slice(-14);
    let riskStdDev = 5; // Default fallback
    
    if (recentRisk.length > 2) {
      // Calculate Linear Regression to find the trend line
      const n = recentRisk.length;
      let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
      recentRisk.forEach((y, x) => {
        sumX += x; sumY += y; sumXY += x * y; sumXX += x * x;
      });
      
      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;

      // Calculate Standard Error (volatility of residuals around the trend)
      const sumSqResiduals = recentRisk.reduce((acc, y, x) => {
        const pred = slope * x + intercept;
        return acc + Math.pow(y - pred, 2);
      }, 0);
      riskStdDev = Math.sqrt(sumSqResiduals / (n - 2));
    }

    // Calculate Risk from Projected Features
    for (let i = 0; i < projectionDays; i++) {
      const d = new Date(lastDate);
      d.setDate(d.getDate() + i + 1);
      projectionLabels.push(d.toLocaleDateString(undefined, { weekday: 'short' }));

      const features = {
        stress: projStressData.values[i],
        sleep: projSleepData.values[i],
        workload: projWorkloadData.values[i],
        coffee: projCoffeeData.values[i]
      };
      
      const pred = await predictAndAdvise('daily', features);
      const score = Math.round(pred.score);
      projectedRisk.push(score);

      // Confidence Interval Calculation: Uncertainty increases by 20% of StdDev each day
      // Use max(3, riskStdDev) to ensure there is always a small interval even if very stable
      const uncertainty = Math.max(3, riskStdDev) * (1 + (i * 0.2)); 
      riskUpper.push(Math.min(100, Math.round(score + uncertainty)));
      riskLower.push(Math.max(0, Math.round(score - uncertainty)));
    }

    // 3. Identify Top Factor (Advanced Statistical Attribution)
    let topFactor = 'N/A';
    let contributionPercent = 0;

    if (checkins.length > 0) {
      // Helper: Pearson Correlation Coefficient
      const calculateCorrelation = (x, y) => {
        const n = x.length;
        if (n < 2) return 0;
        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
        const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
        const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

        const numerator = (n * sumXY) - (sumX * sumY);
        const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
        
        return denominator === 0 ? 0 : numerator / denominator;
      };

      // Helper: Exponential Moving Average
      const calcEMA = (arr) => {
        if (arr.length === 0) return 0;
        const k = 2 / (arr.length + 1);
        return arr.reduce((acc, val) => val * k + acc * (1 - k), arr[0]);
      };

      // Data vectors (last 30 points max for statistical relevance)
      const relevantPoints = historyPoints.slice(-30);
      const vecRisk = relevantPoints.map(p => p.score);
      const vecStress = relevantPoints.map(p => p.stress);
      const vecSleep = relevantPoints.map(p => p.sleep);
      const vecWork = relevantPoints.map(p => p.workload);
      const vecCoffee = relevantPoints.map(p => p.coffee);

      // A. Calculate Correlations (User-specific sensitivity)
      const corrStress = Math.abs(calculateCorrelation(vecStress, vecRisk));
      const corrSleep = Math.abs(calculateCorrelation(vecSleep, vecRisk));
      const corrWork = Math.abs(calculateCorrelation(vecWork, vecRisk));
      const corrCoffee = Math.abs(calculateCorrelation(vecCoffee, vecRisk));

      // B. Define Base Weights (Domain Knowledge / Biological Importance)
      const baseWeights = { stress: 0.35, sleep: 0.35, workload: 0.20, coffee: 0.10 };

      // C. Calculate Current Severity (EMA of last 7 days)
      const recentStress = calcEMA(vecStress.slice(-7));
      const recentSleep = calcEMA(vecSleep.slice(-7));
      const recentWork = calcEMA(vecWork.slice(-7));
      const recentCoffee = calcEMA(vecCoffee.slice(-7));

      // D. Calculate Deviation from Optimal (Normalized 0-1)
      const devStress = Math.max(0, (recentStress - 1) / 9); // 1..10 -> 0..1
      const devWork = Math.max(0, (recentWork - 1) / 9);     // 1..10 -> 0..1
      const devSleep = Math.max(0, (8 - recentSleep) / 8);   // 8..0 -> 0..1 (Less sleep is worse)
      const devCoffee = Math.min(1, recentCoffee / 5);       // 0..5+ -> 0..1

      // E. Compute Final Impact Scores
      const impactStress = devStress * baseWeights.stress * (1 + corrStress);
      const impactSleep = devSleep * baseWeights.sleep * (1 + corrSleep);
      const impactWork = devWork * baseWeights.workload * (1 + corrWork);
      const impactCoffee = devCoffee * baseWeights.coffee * (1 + corrCoffee);

      const totalImpact = impactStress + impactSleep + impactWork + impactCoffee;

      if (totalImpact > 0.05) { // Threshold to avoid noise when everything is good
        const factors = [
          { name: 'High Stress', score: impactStress },
          { name: 'Poor Sleep', score: impactSleep },
          { name: 'Heavy Workload', score: impactWork },
          { name: 'Caffeine Intake', score: impactCoffee }
        ];
        
        factors.sort((a, b) => b.score - a.score);
        topFactor = factors[0].name;
        contributionPercent = Math.round((factors[0].score / totalImpact) * 100);
      } else {
        topFactor = 'Balanced';
        contributionPercent = 0;
      }
    }

    res.json({
      labels,
      dates,
      datasets: {
        risk: riskData,
        stress: stressData,
        sleep: sleepData,
        workload: workloadData,
        coffee: coffeeData
      },
      projections: {
        risk: projectedRisk,
        riskConfidence: { upper: riskUpper, lower: riskLower, volatility: riskStdDev },
        stress: projStressData.values,
        stressConfidence: projStressData.confidence,
        sleep: projSleepData.values,
        sleepConfidence: projSleepData.confidence,
        workload: projWorkloadData.values,
        workloadConfidence: projWorkloadData.confidence,
        coffee: projCoffeeData.values,
        coffeeConfidence: projCoffeeData.confidence
      },
      projectionLabels,
      recentActivity: recentActivity.slice(0, 5),
      topBurnoutFactor: { topFactor, contributionPercent },
      totalCheckins: checkins.length,
      hasBaseline: !!baseline,
      streak
    });

  } catch (error) {
    console.error('Personal report error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/reports/teams?companyCode=XYZ
// Returns aggregated metrics per team
router.get('/teams', async (req, res) => {
  try {
    const { companyCode } = req.query;
    if (!companyCode) return res.status(400).json({ error: 'Company code required' });

    const teams = await db.sequelize.query(
      `SELECT * FROM Teams WHERE companyCode = :companyCode`,
      { replacements: { companyCode }, type: db.sequelize.QueryTypes.SELECT }
    );

    // Fetch all employees for the company to avoid N+1 queries and ensure consistency
    const allEmployees = await db.sequelize.query(
      `SELECT id, teamId FROM Users WHERE companyCode = :companyCode AND (role = 'employee' OR role IS NULL)`,
      { replacements: { companyCode }, type: db.sequelize.QueryTypes.SELECT }
    );

    const metrics = [];

    for (const team of teams) {
      // Filter in memory (loose equality handles string/int mismatches)
      const employees = allEmployees.filter(e => e.teamId == team.id);

      let totalStress = 0;
      let totalWorkload = 0;
      let count = 0;

      for (const emp of employees) {
        const [checkin] = await db.sequelize.query(
          `SELECT stress, workload FROM checkins WHERE userId = :userId ORDER BY createdAt DESC LIMIT 1`,
          { replacements: { userId: emp.id }, type: db.sequelize.QueryTypes.SELECT }
        );
        if (checkin) {
          totalStress += Number(checkin.stress || 0);
          totalWorkload += Number(checkin.workload || 0);
          count++;
        }
      }

      metrics.push({
        teamId: team.id,
        name: team.name,
        memberCount: employees.length,
        avgStress: count > 0 ? (totalStress / count).toFixed(1) : 0,
        avgWorkload: count > 0 ? (totalWorkload / count).toFixed(1) : 0,
        predictedImprovement: count > 0 ? 15 : 0 // Placeholder heuristic
      });
    }

    res.json(metrics);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/reports/:companyCode
// Weekly Team Report Aggregation
router.get('/:companyCode', async (req, res) => {
  try {
    const { companyCode } = req.params;
    
    // 1. Find Employees
    const employees = await db.User.findAll({ 
      where: { 
        companyCode,
        role: { [Op.ne]: 'employer' } // Exclude the employer account itself
      } 
    });
    const employeeIds = employees.map(e => e.id);
    
    // Privacy Guard: Require at least 5 employees to show aggregated data
    if (employeeIds.length < 5) {
      return res.json({ 
        employeeCount: employeeIds.length, 
        totalCheckins: 0,
        privacyLocked: true 
      });
    }

    // 2. Fetch Checkins for Team
    const checkins = await db.Checkin.findAll({
      where: { userId: { [Op.in]: employeeIds } },
      order: [['createdAt', 'ASC']]
    });

    // 3. Aggregate Data & Advanced Attribution
    const riskDistribution = { low: 0, moderate: 0, high: 0, critical: 0 };
    const teamImpacts = { stress: 0, sleep: 0, workload: 0, coffee: 0 };
    
    // Calculate Team Adherence
    let totalTrackedItems = 0;
    let totalCompletedItems = 0;
    
    // We need to fetch tracking data. Assuming ActionPlanTracking model is available via sequelize models
    if (db.sequelize.models.ActionPlanTracking) {
      const allTracking = await db.sequelize.models.ActionPlanTracking.findAll({
        where: { userId: { [Op.in]: employeeIds } }
      });
      
      for (const t of allTracking) {
        const data = typeof t.data === 'string' ? JSON.parse(t.data) : t.data;
        const values = Object.values(data);
        totalTrackedItems += values.length;
        totalCompletedItems += values.filter(v => v === true).length;
      }
    }
    
    const teamAdherence = totalTrackedItems > 0 ? Math.round((totalCompletedItems / totalTrackedItems) * 100) : 0;

    // Helpers for attribution (duplicated to keep route self-contained)
    const calculateCorrelation = (x, y) => {
      const n = x.length;
      if (n < 2) return 0;
      const sumX = x.reduce((a, b) => a + b, 0);
      const sumY = y.reduce((a, b) => a + b, 0);
      const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
      const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
      const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
      const numerator = (n * sumXY) - (sumX * sumY);
      const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
      return denominator === 0 ? 0 : numerator / denominator;
    };
    const calcEMA = (arr) => {
      if (arr.length === 0) return 0;
      const k = 2 / (arr.length + 1);
      return arr.reduce((acc, val) => val * k + acc * (1 - k), arr[0]);
    };
    
    // Calculate current risk for each employee to populate distribution
    for (const empId of employeeIds) {
      const empCheckins = checkins.filter(c => c.userId === empId);
      if (empCheckins.length > 0) {
        // A. Risk Distribution
        const last = empCheckins[empCheckins.length - 1];
        const pred = await predictAndAdvise('daily', last); // Re-calc
        const score = pred.score;
        
        if (score < 30) riskDistribution.low++;
        else if (score < 60) riskDistribution.moderate++;
        else if (score < 80) riskDistribution.high++;
        else riskDistribution.critical++;

        // B. Advanced Attribution (Primary Signal)
        if (empCheckins.length >= 2) {
          const relevantPoints = empCheckins.slice(-30);
          const vecRisk = [];
          for (const c of relevantPoints) {
            const p = await predictAndAdvise('daily', { stress: c.stress, sleep: c.sleep, workload: c.workload, coffee: c.coffee });
            vecRisk.push(p.score);
          }
          const vecStress = relevantPoints.map(p => p.stress);
          const vecSleep = relevantPoints.map(p => p.sleep);
          const vecWork = relevantPoints.map(p => p.workload);
          const vecCoffee = relevantPoints.map(p => p.coffee);

          const corrStress = Math.abs(calculateCorrelation(vecStress, vecRisk));
          const corrSleep = Math.abs(calculateCorrelation(vecSleep, vecRisk));
          const corrWork = Math.abs(calculateCorrelation(vecWork, vecRisk));
          const corrCoffee = Math.abs(calculateCorrelation(vecCoffee, vecRisk));

          const baseWeights = { stress: 0.35, sleep: 0.35, workload: 0.20, coffee: 0.10 };

          const recentStress = calcEMA(vecStress.slice(-7));
          const recentSleep = calcEMA(vecSleep.slice(-7));
          const recentWork = calcEMA(vecWork.slice(-7));
          const recentCoffee = calcEMA(vecCoffee.slice(-7));

          const devStress = Math.max(0, (recentStress - 1) / 9);
          const devWork = Math.max(0, (recentWork - 1) / 9);
          const devSleep = Math.max(0, (8 - recentSleep) / 8);
          const devCoffee = Math.min(1, recentCoffee / 5);

          teamImpacts.stress += devStress * baseWeights.stress * (1 + corrStress);
          teamImpacts.sleep += devSleep * baseWeights.sleep * (1 + corrSleep);
          teamImpacts.workload += devWork * baseWeights.workload * (1 + corrWork);
          teamImpacts.coffee += devCoffee * baseWeights.coffee * (1 + corrCoffee);
        }
      }
    }

    // Determine Top Team Factor
    const totalTeamImpact = teamImpacts.stress + teamImpacts.sleep + teamImpacts.workload + teamImpacts.coffee;
    let teamTopFactor = 'Balanced';
    let contributionPercent = 0;

    if (totalTeamImpact > 0.05) {
      const factors = [
        { name: 'High Stress', score: teamImpacts.stress },
        { name: 'Poor Sleep', score: teamImpacts.sleep },
        { name: 'Heavy Workload', score: teamImpacts.workload },
        { name: 'Caffeine Intake', score: teamImpacts.coffee }
      ];
      factors.sort((a, b) => b.score - a.score);
      teamTopFactor = factors[0].name;
      contributionPercent = Math.round((factors[0].score / totalTeamImpact) * 100);
    }

    // Aggregate Daily Trends (Last 7 Days)
    const aggregatedData = { stress: [], sleep: [], workload: [], coffee: [] };
    const labels = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      labels.push(d.toLocaleDateString(undefined, { weekday: 'short' }));

      const dailyCheckins = checkins.filter(c => new Date(c.createdAt).toISOString().split('T')[0] === dateStr);
      
      if (dailyCheckins.length > 0) {
        const avg = (key) => dailyCheckins.reduce((s, c) => s + c[key], 0) / dailyCheckins.length;
        aggregatedData.stress.push(parseFloat(avg('stress').toFixed(1)));
        aggregatedData.sleep.push(parseFloat(avg('sleep').toFixed(1)));
        aggregatedData.workload.push(parseFloat(avg('workload').toFixed(1)));
        aggregatedData.coffee.push(parseFloat(avg('coffee').toFixed(1)));
      } else {
        aggregatedData.stress.push(null);
        aggregatedData.sleep.push(null);
        aggregatedData.workload.push(null);
        aggregatedData.coffee.push(null);
      }
    }
    
    res.json({
      employeeCount: employees.length,
      totalCheckins: checkins.length,
      riskDistribution,
      datasets: aggregatedData,
      projections: { stress: [3, 3, 3], sleep: [8, 8, 8], workload: [4, 4, 4], coffee: [1, 1, 1] },
      labels,
      projectionLabels: ['Mon', 'Tue', 'Wed'],
      teamStatus: { label: 'Stable', color: '#10b981' },
      insight: { title: 'Good Recovery', suggestion: 'Team sleep levels are improving over the weekend.' },
      drivers: { teamTopFactor: { factor: teamTopFactor, contributionPercent } },
      teamAdherence
    });

  } catch (error) {
    console.error('Team report error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/reports/survey/status
// Checks if user is eligible for pilot survey (>= 3 active days) and hasn't completed it
router.get('/survey/status', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    // Define Model dynamically if not present
    const PilotSurvey = db.sequelize.models.PilotSurvey || db.sequelize.define('PilotSurvey', {
      userId: { type: DataTypes.INTEGER },
      companyCode: { type: DataTypes.STRING },
      activeDays: { type: DataTypes.INTEGER },
      featuresUsed: { type: DataTypes.JSON },
      clarityScore: { type: DataTypes.INTEGER },
      awareness: { type: DataTypes.STRING },
      behaviorChange: { type: DataTypes.STRING },
      behaviorChangeText: { type: DataTypes.TEXT },
      safety: { type: DataTypes.STRING },
      continuedAccess: { type: DataTypes.STRING },
      mustHave: { type: DataTypes.TEXT },
      dismissed: { type: DataTypes.BOOLEAN }
    }, { tableName: 'pilot_surveys' });

    const existing = await PilotSurvey.findOne({ where: { userId } });
    if (existing) return res.json({ completed: true });

    // Calculate active days (Checkins + Action Plan Tracking)
    // 1. Checkins
    const checkins = await db.Checkin.findAll({
      where: { userId },
      attributes: ['createdAt']
    });
    
    // 2. Action Plan Tracking
    let trackingDays = [];
    if (db.sequelize.models.ActionPlanTracking) {
      const trackings = await db.sequelize.models.ActionPlanTracking.findAll({
        where: { userId },
        attributes: ['date']
      });
      trackingDays = trackings.map(t => t.date);
    }

    const checkinDays = checkins.map(c => new Date(c.createdAt).toISOString().split('T')[0]);
    const uniqueDays = new Set([...checkinDays, ...trackingDays]);

    res.json({ completed: false, activeDays: uniqueDays.size });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/reports/survey
// Submits pilot survey response
router.post('/survey', async (req, res) => {
  try {
    const data = req.body;
    const PilotSurvey = db.sequelize.models.PilotSurvey || db.sequelize.define('PilotSurvey', {
      userId: { type: DataTypes.INTEGER },
      companyCode: { type: DataTypes.STRING },
      activeDays: { type: DataTypes.INTEGER },
      featuresUsed: { type: DataTypes.JSON },
      clarityScore: { type: DataTypes.INTEGER },
      awareness: { type: DataTypes.STRING },
      behaviorChange: { type: DataTypes.STRING },
      behaviorChangeText: { type: DataTypes.TEXT },
      safety: { type: DataTypes.STRING },
      continuedAccess: { type: DataTypes.STRING },
      mustHave: { type: DataTypes.TEXT },
      dismissed: { type: DataTypes.BOOLEAN }
    }, { tableName: 'pilot_surveys' });

    await PilotSurvey.create(data);
    res.json({ message: 'Survey submitted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;