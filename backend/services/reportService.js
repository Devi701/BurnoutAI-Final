const db = require('../db/database');
const { Op } = require('sequelize');
const { startOfWeek, endOfWeek, format, addDays } = require('date-fns');

const { generateEmployerInsights } = require('./insightService');
const { predictAndAdvise } = require('./predictionService');
const { analyzeBurnoutDrivers } = require('./analyticsService');
const MINIMUM_EMPLOYEES_FOR_REPORT = 5;

async function getWeeklyReport(companyCode) {
  // 1. Find all users for the given company code.
  const usersInCompany = await db.User.findAll({
    where: { companyCode },
    attributes: ['id'],
  });

  const userIds = usersInCompany.map(u => u.id);

  // 2. Enforce the threshold logic.
  if (userIds.length < MINIMUM_EMPLOYEES_FOR_REPORT) {
    throw new Error(`Reports are only available for companies with ${MINIMUM_EMPLOYEES_FOR_REPORT} or more employees to ensure anonymity.`);
  }

  // 3. Fetch all check-ins for those users from the current week.
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  const checkins = await db.Checkin.findAll({
    where: {
      userId: { [Op.in]: userIds },
      createdAt: {
        [Op.between]: [weekStart, weekEnd],
      },
    },
    order: [['createdAt', 'ASC']],
  });

  // 4. Aggregate the data by day.
  const dailyAverages = {};

  checkins.forEach(checkin => {
    const day = format(checkin.createdAt, 'yyyy-MM-dd');
    if (!dailyAverages[day]) {
      dailyAverages[day] = { stress: [], sleep: [], workload: [], coffee: [], count: 0 };
    }
    dailyAverages[day].stress.push(checkin.stress);
    dailyAverages[day].sleep.push(checkin.sleep);
    dailyAverages[day].workload.push(checkin.workload);
    dailyAverages[day].coffee.push(checkin.coffee);
    dailyAverages[day].count++;
  });

  // 5. Format the data for charting.
  const sortedDays = Object.keys(dailyAverages).sort(); // Ensure chronological order for trend calculation
  const labels = sortedDays.map(day => format(new Date(day), 'EEEE')); // 'Monday', 'Tuesday', etc.
  const datasets = {
    stress: [],
    sleep: [],
    workload: [],
    coffee: [],
  };

  for (const day of sortedDays) {
    datasets.stress.push(dailyAverages[day].stress.reduce((a, b) => a + b, 0) / dailyAverages[day].count);
    datasets.sleep.push(dailyAverages[day].sleep.reduce((a, b) => a + b, 0) / dailyAverages[day].count);
    datasets.workload.push(dailyAverages[day].workload.reduce((a, b) => a + b, 0) / dailyAverages[day].count);
    datasets.coffee.push(dailyAverages[day].coffee.reduce((a, b) => a + b, 0) / dailyAverages[day].count);
  }

  // Calculate Team Status (Stress based)
  let teamStatus = null;
  if (datasets.stress.length >= 5) {
    teamStatus = { label: 'Stable', color: '#64748b' };
    const latest = datasets.stress[datasets.stress.length - 1];
    const previous = datasets.stress.slice(0, datasets.stress.length - 1);
    const avgPrevious = previous.reduce((a, b) => a + b, 0) / previous.length;
    
    if (latest < avgPrevious - 0.5) {
      teamStatus = { label: 'Doing Better than Expected', color: '#10b981' };
    } else if (latest > avgPrevious + 0.5) {
      teamStatus = { label: 'Doing Worse than Expected', color: '#ef4444' };
    }
  }

  // Calculate Projections (Trend Lines)
  const projectionCount = 3;
  const projections = {
    stress: calculateTrend(datasets.stress, projectionCount),
    sleep: calculateTrend(datasets.sleep, projectionCount),
    workload: calculateTrend(datasets.workload, projectionCount),
    coffee: calculateTrend(datasets.coffee, projectionCount),
  };
  
  const lastDay = sortedDays.length > 0 ? new Date(sortedDays[sortedDays.length - 1]) : new Date();
  const projectionLabels = Array.from({ length: projectionCount }, (_, i) => 
    format(addDays(lastDay, i + 1), 'EEEE')
  );

  // 6. Generate an actionable insight for the employer.
  const insight = generateEmployerInsights({ labels, datasets });

  // 7. Fetch and Aggregate Quiz Results
  const quizResults = await db.QuizResult.findAll({
    where: {
      userId: { [Op.in]: userIds },
      createdAt: { [Op.between]: [weekStart, weekEnd] },
    },
    order: [['createdAt', 'ASC']],
  });

  const quizzes = {};

  ['small', 'full'].forEach(type => {
    const typeResults = quizResults.filter(r => r.quizType === type);
    const uniqueUsers = new Set(typeResults.map(r => r.userId));

    if (uniqueUsers.size >= MINIMUM_EMPLOYEES_FOR_REPORT) {
      const dailyData = {};
      const categorySums = {};
      const categoryCounts = {};

      typeResults.forEach(r => {
        const day = format(r.createdAt, 'yyyy-MM-dd');
        if (!dailyData[day]) dailyData[day] = { sum: 0, count: 0 };
        dailyData[day].sum += r.score;
        dailyData[day].count++;

        // Aggregate breakdown if available
        if (r.breakdown) {
          const bd = typeof r.breakdown === 'string' ? JSON.parse(r.breakdown) : r.breakdown;
          Object.keys(bd).forEach(cat => {
            if (!categorySums[cat]) { categorySums[cat] = 0; categoryCounts[cat] = 0; }
            categorySums[cat] += bd[cat];
            categoryCounts[cat]++;
          });
        }
      });

      const labels = Object.keys(dailyData).map(day => format(new Date(day), 'EEEE'));
      const data = Object.values(dailyData).map(d => d.sum / d.count);
      const avgScore = typeResults.reduce((a, b) => a + b.score, 0) / typeResults.length;
      
      let analysis = "Scores indicate stable wellness levels.";
      if (avgScore > 60) analysis = "High average scores suggest potential burnout risk in this area.";
      else if (avgScore < 30) analysis = "Low average scores indicate good wellness in this area.";

      const breakdownAvg = {};
      Object.keys(categorySums).forEach(cat => {
        breakdownAvg[cat] = categorySums[cat] / categoryCounts[cat];
      });

      quizzes[type] = { labels, data, average: avgScore, participantCount: uniqueUsers.size, analysis, breakdown: breakdownAvg };
    }
  });

  // 8. Analyze Top Burnout Drivers (New Feature)
  const drivers = analyzeBurnoutDrivers(checkins, quizResults);

  // 9. Calculate Risk Distribution (Buckets)
  // Group check-ins by user to find their average risk for the week
  const userRisks = {};
  checkins.forEach(c => {
    try {
      const result = predictAndAdvise('daily', { stress: c.stress, sleep: c.sleep, workload: c.workload, coffee: c.coffee });
      if (!userRisks[c.userId]) userRisks[c.userId] = [];
      userRisks[c.userId].push(result.score);
    } catch (e) { /* ignore calculation errors */ }
  });

  const riskDistribution = { low: 0, moderate: 0, high: 0, critical: 0 };
  
  Object.values(userRisks).forEach(scores => {
    if (scores.length === 0) return;
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    
    if (avgScore >= 80) riskDistribution.critical++;
    else if (avgScore >= 60) riskDistribution.high++;
    else if (avgScore >= 30) riskDistribution.moderate++;
    else riskDistribution.low++;
  });

  return { labels, datasets, projections, projectionLabels, totalCheckins: checkins.length, employeeCount: userIds.length, insight, quizzes, drivers, teamStatus, riskDistribution };
}

async function getPersonalHistory(userId) {
  // 1. Fetch all check-ins for the user, ordered by date (e.g., last 30 days).
  const checkins = await db.Checkin.findAll({
    where: { userId },
    order: [['createdAt', 'ASC']],
    limit: 30,
  });

  // 2. Fetch Quiz Results for driver analysis
  const quizResults = await db.QuizResult.findAll({
    where: { userId },
    order: [['createdAt', 'ASC']],
    limit: 30,
  });

  // 3. Analyze Top Burnout Driver
  const { employeeInsights } = analyzeBurnoutDrivers(checkins, quizResults);
  const topBurnoutFactor = employeeInsights.find(i => i.userId == userId) || null;

  if (!checkins || checkins.length === 0) {
    return { labels: [], datasets: { stress: [], sleep: [], workload: [], coffee: [] }, projections: {}, totalCheckins: 0, topBurnoutFactor };
  }

  // Calculate risk score for each check-in to show progression
  const riskScores = checkins.map(c => {
    try {
      const result = predictAndAdvise('daily', {
        stress: c.stress,
        sleep: c.sleep,
        workload: c.workload,
        coffee: c.coffee
      });
      return result.score;
    } catch (e) { return 0; }
  });

  // Calculate Personal Status
  let personalStatus = null;
  if (riskScores.length >= 5) {
    personalStatus = { label: 'Stable', color: '#64748b' };
    const latest = riskScores[riskScores.length - 1];
    const previous = riskScores.slice(Math.max(0, riskScores.length - 8), riskScores.length - 1);
    const avgPrevious = previous.reduce((a, b) => a + b, 0) / previous.length;

    if (latest < avgPrevious - 5) {
      personalStatus = { label: 'Doing Better than Expected', color: '#10b981' };
    } else if (latest > avgPrevious + 5) {
      personalStatus = { label: 'Doing Worse than Expected', color: '#ef4444' };
    }
  }

  // 2. Format the data for charting.
  const labels = checkins.map(c => format(c.createdAt, 'MMM d')); // e.g., 'Jan 23'
  const datasets = {
    risk: riskScores,
    stress: checkins.map(c => c.stress),
    sleep: checkins.map(c => c.sleep),
    workload: checkins.map(c => c.workload),
    coffee: checkins.map(c => c.coffee),
  };

  // Calculate Projections
  const projectionCount = 3;
  const projections = {
    risk: calculateTrend(riskScores, projectionCount),
    stress: calculateTrend(datasets.stress, projectionCount),
    sleep: calculateTrend(datasets.sleep, projectionCount),
    workload: calculateTrend(datasets.workload, projectionCount),
    coffee: calculateTrend(datasets.coffee, projectionCount),
  };

  const lastCheckinDate = checkins.length > 0 ? checkins[checkins.length - 1].createdAt : new Date();
  const projectionLabels = Array.from({ length: projectionCount }, (_, i) => 
    format(addDays(lastCheckinDate, i + 1), 'MMM d')
  );

  // Prepare a list of recent activity (reverse chronological for display)
  const recentActivity = checkins.map(c => ({
    id: c.id,
    date: c.createdAt,
    stress: c.stress,
    note: c.note
  })).reverse();

  return { labels, datasets, projections, projectionLabels, totalCheckins: checkins.length, topBurnoutFactor, personalStatus, recentActivity };
}

/**
 * Calculates a linear trend and projects future values.
 * @param {number[]} values - Historical data points
 * @param {number} periods - Number of future periods to project
 * @returns {number[]} Projected values
 */
function calculateTrend(values, periods = 3) {
  const n = values.length;
  if (n < 2) return Array(periods).fill(null);

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }

  let slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  
  // Dampen the slope to be conservative.
  // This prevents short-term fluctuations from creating unrealistic projections (like 0 sleep).
  slope = slope * 0.5;

  const lastVal = values[n - 1];

  return Array.from({ length: periods }, (_, i) => {
    // Project from the last actual value to ensure continuity
    const val = lastVal + slope * (i + 1);
    return Math.max(0, val); // Clamp to 0
  });
}

module.exports = { getWeeklyReport, getPersonalHistory };
