const db = require('../config/database');
const { Op } = require('sequelize');
const { startOfWeek, endOfWeek, format, addDays } = require('date-fns');
const { spawn } = require('child_process');
const path = require('path');
const cacheService = require('./cacheService');

// Ensure models are loaded
require('./jiraService');
require('./slackService');
require('./trelloService');
require('./googleCalendar');

const { generateEmployerInsights } = require('./insightService');
const { predictAndAdvise } = require('./predictionService');
const { analyzeBurnoutDrivers } = require('./analyticsService');
const MINIMUM_EMPLOYEES_FOR_REPORT = 5;

async function getWeeklyReport(companyCode) {
  const cacheKey = `report:weekly:${companyCode}`;
  const cached = cacheService.get(cacheKey);
  if (cached) {
    console.log(`[ReportService] Serving weekly report from cache for ${companyCode}`);
    return cached;
  }

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
      dailyAverages[day] = { stress: [], energy: [], engagement: [], sleepQuality: [], count: 0 };
    }
    dailyAverages[day].stress.push(checkin.stress);
    dailyAverages[day].energy.push(checkin.energy);
    if (checkin.engagement) dailyAverages[day].engagement.push(checkin.engagement);
    if (checkin.sleepQuality) dailyAverages[day].sleepQuality.push(checkin.sleepQuality);
    dailyAverages[day].count++;
  });

  // 5. Format the data for charting.
  const sortedDays = Object.keys(dailyAverages).sort((a, b) => a.localeCompare(b)); // Ensure chronological order for trend calculation
  const labels = sortedDays.map(day => format(new Date(day), 'EEEE')); // 'Monday', 'Tuesday', etc.
  const datasets = {
    stress: [],
    energy: [],
    engagement: [],
    sleepQuality: [],
    burnoutIndex: [], // New Composite Metric
  };

  for (const day of sortedDays) {
    datasets.stress.push(dailyAverages[day].stress.reduce((a, b) => a + b, 0) / dailyAverages[day].count);
    datasets.energy.push(dailyAverages[day].energy.reduce((a, b) => a + b, 0) / dailyAverages[day].count);
    datasets.engagement.push(dailyAverages[day].engagement.length ? dailyAverages[day].engagement.reduce((a, b) => a + b, 0) / dailyAverages[day].engagement.length : 0);
    datasets.sleepQuality.push(dailyAverages[day].sleepQuality.length ? dailyAverages[day].sleepQuality.reduce((a, b) => a + b, 0) / dailyAverages[day].sleepQuality.length : 0);
    
    // Calculate Composite Burnout Index (0-100)
    // Formula: Average of negative factors. Stress is negative. Energy/Sleep/Engagement are positive (so we invert them).
    const s = datasets.stress.at(-1) || 0;
    const e = datasets.energy.at(-1) || 50;
    const sl = datasets.sleepQuality.at(-1) || 50;
    const eng = datasets.engagement.at(-1) || 50;
    datasets.burnoutIndex.push(Math.round((s + (100 - e) + (100 - sl) + (100 - eng)) / 4));
  }

  // Calculate Team Status (Stress based)
  let teamStatus = null;
  if (datasets.stress.length >= 5) {
    teamStatus = { label: 'Stable', color: '#64748b' };
    const latest = datasets.stress.at(-1);
    const previous = datasets.stress.slice(0, -1);
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
    energy: calculateTrend(datasets.energy, projectionCount),
    engagement: calculateTrend(datasets.engagement, projectionCount),
    burnoutIndex: calculateTrend(datasets.burnoutIndex, projectionCount),
  };
  
  const lastDay = sortedDays.length > 0 ? new Date(sortedDays.at(-1)) : new Date();
  const projectionLabels = Array.from({ length: projectionCount }, (_, i) => 
    format(addDays(lastDay, i + 1), 'EEEE')
  );

  // 6. Generate an actionable insight for the employer.
  const insight = generateEmployerInsights({ labels, datasets });

  // 6b. Advanced Inference: Correlation Analysis
  const correlations = {
    stressVsSleep: calculateCorrelation(datasets.stress, datasets.sleepQuality),
    stressVsEngagement: calculateCorrelation(datasets.stress, datasets.engagement)
  };

  let advancedInference = "Data patterns are currently stable.";
  if (correlations.stressVsSleep < -0.6) {
    advancedInference = "Strong negative correlation detected: Poor sleep quality is a primary driver of recent team stress spikes.";
  } else if (correlations.stressVsEngagement < -0.6) {
    advancedInference = "Engagement drops are strongly preceding stress increases. Consider reviewing recent workload changes.";
  }

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
      const result = { score: (c.stress + (100 - c.energy)) / 2 }; // Simplified risk
      if (!userRisks[c.userId]) userRisks[c.userId] = [];
      userRisks[c.userId].push(result.score);
    } catch (e) { console.error('Risk calc error:', e.message); }
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

  const reportData = { 
    labels, 
    datasets, 
    projections, 
    projectionLabels, 
    totalCheckins: checkins.length, 
    employeeCount: userIds.length, 
    insight, 
    advancedInference, // New AI-like inference
    quizzes, 
    drivers, 
    teamStatus, 
    riskDistribution 
  };

  // Cache for 15 minutes (900 seconds)
  cacheService.set(cacheKey, reportData, 900);
  return reportData;
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
    return (c.stress + (100 - (c.energy || 50))) / 2;
  });

  // Calculate Correlations for Personal Inference
  const stressData = checkins.map(c => c.stress);
  const sleepData = checkins.map(c => c.sleepQuality || 0);
  const corrSleepStress = calculateCorrelation(stressData, sleepData);

  let personalInference = "Your wellness metrics are balanced.";
  if (corrSleepStress < -0.5) {
    personalInference = "We've detected a pattern: On days you report lower sleep quality, your stress levels tend to be significantly higher.";
  } else if (checkins.length > 5 && riskScores.at(-1) > 70) {
    personalInference = "Your calculated burnout risk is trending high. Prioritize recovery today.";
  }

  // Calculate Personal Status
  let personalStatus = null;
  if (riskScores.length >= 5) {
    personalStatus = { label: 'Stable', color: '#64748b' };
    const latest = riskScores[riskScores.length - 1];
    const previous = riskScores.slice(Math.max(0, riskScores.length - 8), -1);
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
    energy: checkins.map(c => c.energy),
    engagement: checkins.map(c => c.engagement || 0),
    sleepQuality: checkins.map(c => c.sleepQuality || 0),
  };

  // Calculate Projections
  const projectionCount = 3;
  const projections = {
    risk: calculateTrend(riskScores, projectionCount),
    stress: calculateTrend(datasets.stress, projectionCount),
    energy: calculateTrend(datasets.energy, projectionCount),
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

  return { labels, datasets, projections, projectionLabels, totalCheckins: checkins.length, topBurnoutFactor, personalStatus, recentActivity, personalInference };
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

  return Array.from(new Array(periods), (_, i) => {
    // Project from the last actual value to ensure continuity
    const val = lastVal + slope * (i + 1);
    return Math.max(0, val); // Clamp to 0
  });
}

/**
 * Calculates Pearson Correlation Coefficient (-1 to 1).
 * @param {number[]} x 
 * @param {number[]} y 
 * @returns {number}
 */
function calculateCorrelation(x, y) {
  const n = x.length;
  if (n !== y.length || n < 2) return 0;

  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  return (denX === 0 || denY === 0) ? 0 : num / Math.sqrt(denX * denY);
}

/**
 * Generates a comprehensive report by combining DB data with Python analysis.
 * This merges Calendar, Checkins, and (future) Task data into one analysis pipeline.
 * 
 * @param {number} userId 
 * @returns {Promise<Object>} The analysis result containing stats and base64 graphs.
 */
async function getComprehensiveReport(userId) {
  const cacheKey = `report:comprehensive:${userId}`;
  const cached = cacheService.get(cacheKey);
  if (cached) {
    console.log(`[ReportService] Serving comprehensive report from cache for User ${userId}`);
    return cached;
  }

  try {
    // 1. Fetch Calendar Events
    // Accessing the model dynamically from the sequelize instance
    const CalendarEvent = db.sequelize.models.CalendarEvent;
    const JiraIssue = db.sequelize.models.JiraIssue;
    const SlackActivity = db.sequelize.models.SlackActivity;
    const TrelloCard = db.sequelize.models.TrelloCard;

    let calendarEvents = [];
    
    if (CalendarEvent) {
      calendarEvents = await CalendarEvent.findAll({
        where: { userId },
        attributes: ['startTime', 'endTime', 'summary', 'eventType'],
        order: [['startTime', 'ASC']]
      });
    }

    // 1b. Fetch Integration Data
    let jiraIssues = [];
    if (JiraIssue) {
      jiraIssues = await JiraIssue.findAll({
        where: { userId },
        attributes: ['key', 'storyPoints', 'created', 'updated', 'resolutionDate', 'status']
      });
    }

    let slackActivity = [];
    if (SlackActivity) {
      slackActivity = await SlackActivity.findAll({ where: { userId } });
    }

    let trelloCards = [];
    if (TrelloCard) {
      trelloCards = await TrelloCard.findAll({
        where: { userId },
        attributes: ['name', 'due', 'closed', 'dateLastActivity']
      });
    }

    // 2. Fetch Checkins
    const checkins = await db.Checkin.findAll({
      where: { userId },
      attributes: ['createdAt', 'stress', 'energy', 'sleepQuality'],
      order: [['createdAt', 'ASC']]
    });

    // 3. Prepare Payload for Python
    const payload = {
      calendar: calendarEvents.map(e => e.toJSON()),
      checkins: checkins.map(c => c.toJSON()),
      jira: jiraIssues.map(j => j.toJSON()),
      slack: slackActivity.map(s => s.toJSON()),
      trello: trelloCards.map(t => t.toJSON())
    };

    // 4. Spawn Python Process
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(__dirname, 'comprehensive_report.py');
      const pythonProcess = spawn('python3', [scriptPath]);
      
      let dataString = '';
      let errorString = '';

      pythonProcess.stdout.on('data', (data) => {
        dataString += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorString += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) return reject(new Error(`Python analysis failed: ${errorString}`));
        try { 
          const result = JSON.parse(dataString);
          // Cache for 1 hour (3600 seconds) as this is computationally expensive
          cacheService.set(cacheKey, result, 3600);
          resolve(result); 
        } 
        catch (e) { reject(new Error(`Invalid JSON from Python: ${dataString}`)); }
      });

      pythonProcess.stdin.write(JSON.stringify(payload));
      pythonProcess.stdin.end();
    });
  } catch (error) {
    console.error('Comprehensive Report Error:', error);
    throw error;
  }
}

module.exports = { getWeeklyReport, getPersonalHistory, getComprehensiveReport };
