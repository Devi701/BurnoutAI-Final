/**
 * Analytics Service
 * 
 * Responsible for analyzing raw check-in and quiz data to identify
 * specific drivers of burnout (e.g., "Poor Sleep", "High Workload").
 * 
 * Logic handles missing data gracefully and normalizes various scales
 * into a unified 0-100 "Burnout Contribution Score".
 */

/**
 * Normalizes a metric value to a 0-100 scale where 100 = High Burnout Contribution.
 * @param {string} key - The metric name (e.g., 'stress', 'sleep')
 * @param {number} value - The raw value
 * @returns {number|null} Normalized score (0-100) or null if invalid
 */
const normalizeMetric = (key, value) => {
  if (value === null || value === undefined) return null;
  const val = Number(value);
  if (isNaN(val)) return null;

  switch (key) {
    // Direct Mapping: High Value = High Risk
    case 'Emotional Exhaustion':
    case 'Stress': // Quiz category
    case 'Somatic Fatigue':
    case 'Work Pressure':
    case 'Cognitive Demands':
      // Assuming input is 0-100. If > 100, cap at 100.
      return Math.min(100, Math.max(0, val));
    
    // Check-in Metrics (0-10 scale) -> Scale to 0-100
    case 'stress':
    case 'workload':
      return Math.min(100, Math.max(0, val * 10));

    // Scaled Mapping: Coffee
    case 'coffee':
      // Arbitrary scale: 0 cups = 0 risk, 10 cups = 100 risk
      return Math.min(100, Math.max(0, val * 10));

    // Inverse Mapping: Low Value = High Risk
    case 'sleep':
      // Target: 8 hours. < 8 hours increases risk. 0 hours = 100 risk.
      // Formula: (8 - sleep) * 25. (e.g., 6 hours = 50 risk, 4 hours = 100 risk)
      return Math.min(100, Math.max(0, (8 - val) * 25));

    case 'Support':
    case 'Autonomy':
      // Input 0-100. 0 is bad (100 risk), 100 is good (0 risk).
      return Math.min(100, Math.max(0, 100 - val));

    default:
      return null;
  }
};

/**
 * Analyzes check-ins and quiz results to find top burnout drivers.
 * 
 * @param {Array} checkins - Array of checkin objects
 * @param {Array} quizResults - Array of quiz result objects
 * @returns {Object} Structured analysis containing team and individual drivers
 */
function analyzeBurnoutDrivers(checkins = [], quizResults = []) {
  const userFactors = {}; // { userId: { factorName: { sum: 0, count: 0 } } }
  const teamFactors = {}; // { factorName: { sum: 0, count: 0 } }

  // Helper to update stats
  const updateStats = (userId, label, score) => {
    if (score === null) return;

    // Update User Stats
    if (!userFactors[userId]) userFactors[userId] = {};
    if (!userFactors[userId][label]) userFactors[userId][label] = { sum: 0, count: 0 };
    userFactors[userId][label].sum += score;
    userFactors[userId][label].count++;

    // Update Team Stats
    if (!teamFactors[label]) teamFactors[label] = { sum: 0, count: 0 };
    teamFactors[label].sum += score;
    teamFactors[label].count++;
  };

  // 1. Process Check-ins
  checkins.forEach(c => {
    updateStats(c.userId, 'High Stress', normalizeMetric('stress', c.stress));
    updateStats(c.userId, 'Poor Sleep', normalizeMetric('sleep', c.sleep));
    updateStats(c.userId, 'Heavy Workload', normalizeMetric('workload', c.workload));
  });

  // 2. Process Quiz Results
  quizResults.forEach(q => {
    let breakdown = q.breakdown;
    // Handle potential stringified JSON from DB
    if (typeof breakdown === 'string') {
      try { breakdown = JSON.parse(breakdown); } catch (e) { breakdown = {}; }
    }
    if (!breakdown) return;

    Object.entries(breakdown).forEach(([category, val]) => {
      updateStats(q.userId, category, normalizeMetric(category, val));
    });
  });

  // 3. Calculate Team Top Factor
  let teamTopFactor = { factor: 'None', score: 0 };
  Object.entries(teamFactors).forEach(([factor, data]) => {
    const avg = data.sum / data.count;
    if (avg > teamTopFactor.score) {
      teamTopFactor = { factor, score: avg };
    }
  });

  // 4. Calculate Per-Employee Top Factor
  const employeeInsights = Object.entries(userFactors).map(([userId, factors]) => {
    let top = { factor: 'None', score: 0 };
    Object.entries(factors).forEach(([factor, data]) => {
      const avg = data.sum / data.count;
      if (avg > top.score) {
        top = { factor, score: avg };
      }
    });
    return { userId: parseInt(userId), topFactor: top.factor, score: top.score };
  });

  return { teamTopFactor, employeeInsights };
}

module.exports = { analyzeBurnoutDrivers };