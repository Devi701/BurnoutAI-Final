/**
 * Mocks fetching data from external platforms.
 * In a real app, this would call your backend which proxies the 3rd party APIs.
 */
export const fetchIntegrationData = async (service) => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 300));

  // Helper to generate mock hourly distribution (00:00 - 23:00)
  const getHourlyDist = (peakHour, magnitude) => Array.from({ length: 24 }, (_, i) => {
    const diff = Math.abs(i - peakHour);
    // Gaussian-ish curve
    return Math.max(0, Math.floor(magnitude * Math.exp(-0.2 * diff * diff)));
  });

  switch (service) {
    case 'jira':
      return {
        activeTickets: 8,
        overdueTickets: 2,
        avgCycleTimeDays: 4,
        hourlyActivity: getHourlyDist(14, 8) // Peak work at 2 PM
      };
    case 'slack':
      return {
        messagesSent: 120,
        afterHoursMessages: 5,
        channelsJoined: 8,
        hourlyActivity: getHourlyDist(11, 12) // Peak chat at 11 AM
      };
    case 'trello':
      return {
        cardsMoved: 15,
        cardsStale: 3,
        hourlyActivity: getHourlyDist(16, 5) // Peak at 4 PM
      };
    default:
      return {};
  }
};

/**
 * Normalizes raw external data into a 0-100 risk score.
 * 0 = Low Risk/Load, 100 = High Risk/Load.
 */
export const normalizeExternalData = (service, data) => {
  let score = 0;

  if (service === 'jira') {
    // 5 points per active ticket, 15 points per overdue ticket
    score = (data.activeTickets * 5) + (data.overdueTickets * 15);
  } else if (service === 'slack') {
    // 1 point per 10 messages, 8 points per after-hours message
    score = (data.messagesSent / 10) + (data.afterHoursMessages * 8);
  } else if (service === 'trello') {
    // Inverse metric: High movement is good (engagement), but too much might be burnout?
    // Let's treat stale cards as the risk factor here.
    score = (data.cardsStale * 10) + (data.cardsMoved * 2);
  }

  return Math.min(Math.max(Math.round(score), 0), 100);
};

/**
 * Analyzes the overlap between communication (Slack) and workload (Jira)
 * to identify context switching risks and distractions.
 */
export const analyzeWorkPatterns = (slackData, jiraData) => {
  if (!slackData?.hourlyActivity || !jiraData?.hourlyActivity) return {
    contextSwitchingScore: 0,
    peakContextSwitchingHour: null,
    distractionLevel: 0,
    hourlyRisks: []
  };

  let maxOverlap = 0;
  let peakHour = -1;
  let totalDistraction = 0;

  const hourlyRisks = slackData.hourlyActivity.map((msgs, hour) => {
    const work = jiraData.hourlyActivity[hour] || 0;
    
    // Context Switching: High Work + High Chat
    // We use a geometric mean to find the overlap intensity.
    const overlap = Math.sqrt(work * msgs);
    
    if (overlap > maxOverlap) {
      maxOverlap = overlap;
      peakHour = hour;
    }

    // Distraction: Chat volume specifically during active work hours
    if (work > 2) { // Threshold for "active work"
      totalDistraction += msgs;
    }

    return Math.round(overlap * 10); // Scale up for visibility
  });

  return {
    contextSwitchingScore: Math.min(100, Math.round(maxOverlap * 20)), // Normalize to 0-100
    peakContextSwitchingHour: peakHour,
    distractionLevel: Math.min(100, Math.round(totalDistraction / 2)), // Normalize
    hourlyRisks
  };
};