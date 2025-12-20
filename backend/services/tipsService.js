/**
 * Rule-based tips generator. Tune thresholds to your model scale.
 */
function generateTips(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return ['No prediction available.'];
  
  if (s >= 80) {
    return [
      'Critical Risk: Your score indicates a very high level of burnout. It is strongly recommended to speak with a manager, HR representative, or a mental health professional immediately.',
      'Action: Schedule time off as soon as possible to disconnect and recover.',
      'Habit: Prioritize getting 7-9 hours of sleep per night and consider a digital detox in the evenings to aid rest.'
    ];
  }

  if (s >= 60) {
    return [
      'High Risk: You are showing significant signs of burnout. Proactive steps are necessary to prevent further escalation.',
      'Action: Review your current workload with your manager to identify tasks that can be delegated, postponed, or de-prioritized.',
      'Habit: Block out two 15-minute "no-meeting" breaks in your calendar each day to step away from your screen.'
    ];
  }

  if (s >= 40) {
    return [
      'Moderate Risk: You are experiencing elevated stress that could lead to burnout if unaddressed.',
      'Action: Identify one major stressor in your work week and brainstorm a small change you can make to mitigate it.',
      'Habit: Practice a 5-minute mindfulness or deep-breathing exercise at the start and end of your workday.'
    ];
  }

  if (s >= 20) {
    return [
      'Low Risk: Your stress levels are manageable, but it\'s important to maintain healthy habits.',
      'Action: Ensure you are taking regular short breaks throughout the day to stretch and rest your eyes.',
      'Habit: Continue to protect your work-life balance by setting clear boundaries for your working hours.'
    ];
  }

  return [
    'Very Low Risk: You are managing stress well. Keep up the great work!',
    'Action: Share what works for you with a teammate. A supportive culture benefits everyone.',
    'Habit: Reflect on what aspects of your work are most energizing and try to incorporate more of them into your week.'
  ];
}

module.exports = { generateTips };