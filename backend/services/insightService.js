/**
 * Generates actionable insights for employers based on aggregated team data.
 */

const INSIGHT_THRESHOLDS = {
  stress: 7,   // Average stress level above 7/10 is high.
  sleep: 6.5,  // Average sleep below 6.5 hours is low.
  workload: 7, // Average workload perception above 7/10 is high.
};

function generateEmployerInsights(aggregatedData) {
  const insights = [];
  const avgStress = aggregatedData.datasets.stress.reduce((a, b) => a + b, 0) / aggregatedData.datasets.stress.length;
  const avgSleep = aggregatedData.datasets.sleep.reduce((a, b) => a + b, 0) / aggregatedData.datasets.sleep.length;
  const avgWorkload = aggregatedData.datasets.workload.reduce((a, b) => a + b, 0) / aggregatedData.datasets.workload.length;

  if (avgStress > INSIGHT_THRESHOLDS.stress) {
    insights.push({
      title: "High Team Stress Detected",
      suggestion: "Consider holding a team meeting to openly discuss current pressures. Acknowledge the high-stress environment and ask what support or resources would be most helpful.",
      priority: 1,
    });
  }

  if (avgWorkload > INSIGHT_THRESHOLDS.workload) {
    insights.push({
      title: "High Perceived Workload",
      suggestion: "Review the team's current projects and deadlines. Look for opportunities to re-prioritize or extend timelines on non-critical tasks to alleviate pressure.",
      priority: 2,
    });
  }

  if (avgSleep < INSIGHT_THRESHOLDS.sleep) {
    insights.push({
      title: "Low Average Sleep",
      suggestion: "Team-wide low sleep can impact cognitive performance. Remind the team about the importance of disconnecting after work hours and discourage after-hours communication.",
      priority: 3,
    });
  }

  // Return the highest priority insight, or a default one if none are triggered.
  if (insights.length > 0) {
    return insights.sort((a, b) => a.priority - b.priority)[0];
  }

  return {
    title: "Team is Trending Well",
    suggestion: "Your team's key wellness metrics are within a healthy range. Continue to foster a supportive environment and encourage open communication.",
    priority: 0,
  };
}

module.exports = { generateEmployerInsights };