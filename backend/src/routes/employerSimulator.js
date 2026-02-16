const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { Op } = require('sequelize');
const SimulationService = require('../services/simulationService');

const { parseISO, differenceInMinutes, format, isValid } = require('date-fns');

const average = (arr, fallback = 0) => {
  if (!Array.isArray(arr) || arr.length === 0) return fallback;
  const valid = arr.filter(v => Number.isFinite(v));
  if (valid.length === 0) return fallback;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
};

const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

// Helper: Calculate Focus Metrics (per-user)
function calculateFocusMetrics(calendarEvents) {
  if (!calendarEvents || calendarEvents.length === 0) return [];

  const eventsByDate = {};
  calendarEvents.forEach(e => {
    const start = parseISO(e.startTime);
    const end = parseISO(e.endTime);
    if (!isValid(start) || !isValid(end)) return;
    const dateKey = format(start, 'yyyy-MM-dd');
    if (!eventsByDate[dateKey]) eventsByDate[dateKey] = [];
    const attendeeCount = e.attendees ? e.attendees.length : 0;
    eventsByDate[dateKey].push({ start, end, attendeeCount });
  });

  const results = [];
  Object.keys(eventsByDate).forEach(date => {
    const events = eventsByDate[date].sort((a, b) => a.start - b.start);

    let meetingHours = 0;
    let mediumBlockTime = 0; // 30-90m
    let fragmentedBlockTime = 0; // < 30m (gaps)

    const merged = [];
    if (events.length > 0) {
      let current = { ...events[0] };

      for (let i = 1; i < events.length; i++) {
        const next = events[i];
        if (next.start < current.end) {
          current.end = new Date(Math.max(current.end, next.end));
        } else {
          merged.push(current);
          current = { ...next };
        }
      }
      merged.push(current);
    }

    merged.forEach(m => {
      meetingHours += differenceInMinutes(m.end, m.start) / 60;
    });

    for (let i = 0; i < merged.length - 1; i++) {
      const gap = differenceInMinutes(merged[i+1].start, merged[i].end);
      if (gap >= 30 && gap < 90) {
        mediumBlockTime += gap / 60;
      } else if (gap > 0 && gap < 30) {
        fragmentedBlockTime += gap / 60;
      }
    }

    const focusHours = Math.max(0, 8.0 - meetingHours - fragmentedBlockTime - mediumBlockTime);

    results.push({
      date,
      meeting_hours: meetingHours,
      fragmented_hours: fragmentedBlockTime,
      medium_hours: mediumBlockTime,
      focus_hours: focusHours
    });
  });

  return results.sort((a, b) => a.date.localeCompare(b.date));
}

const applyEmployerActions = (baseline, actions) => {
  let meetingReduction = 0;
  let focusBoost = 0;
  let fragmentedReduction = 0;
  let slackReduction = 0;
  let ticketReduction = 0;
  let stressReduction = 0;

  actions.forEach(action => {
    const intensity = Number(action.intensity || 0) / 100;
    const adherence = Number(action.adherence || 100) / 100;
    const impact = intensity * adherence;

    switch (action.type) {
      case 'workload':
        ticketReduction += 0.35 * impact;
        stressReduction += 0.2 * impact;
        break;
      case 'recovery':
        stressReduction += 0.35 * impact;
        focusBoost += 0.15 * impact;
        break;
      case 'meeting_reduction':
        meetingReduction += 0.5 * impact;
        focusBoost += 0.25 * impact;
        fragmentedReduction += 0.2 * impact;
        break;
      case 'focus_blocks':
        fragmentedReduction += 0.45 * impact;
        focusBoost += 0.35 * impact;
        break;
      case 'async_hours':
        slackReduction += 0.5 * impact;
        stressReduction += 0.1 * impact;
        break;
      case 'staffing':
        ticketReduction += 0.5 * impact;
        meetingReduction += 0.15 * impact;
        break;
      case 'process_automation':
        ticketReduction += 0.4 * impact;
        fragmentedReduction += 0.2 * impact;
        break;
      default:
        break;
    }
  });

  const projectedMeetingHours = baseline.meetingHours * (1 - Math.min(meetingReduction, 0.7));
  const projectedFragmented = baseline.fragmentedHours * (1 - Math.min(fragmentedReduction, 0.7));
  const projectedFocus = baseline.focusHours * (1 + Math.min(focusBoost, 0.6));
  const projectedSlack = baseline.slackMessages * (1 - Math.min(slackReduction, 0.7));
  const projectedTickets = baseline.activeTickets * (1 - Math.min(ticketReduction, 0.7));

  return {
    projectedMeetingHours,
    projectedFragmented,
    projectedFocus,
    projectedSlack,
    projectedTickets,
    stressReduction: Math.min(stressReduction, 0.6)
  };
};

// Employer Action Simulator
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

    if (employeeIds.length < 5) {
      return res.json({
        privacyLocked: true,
        employeeCount: employeeIds.length,
        error: 'At least 5 employees required to run simulations.'
      });
    }
    
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

    // Calendar (last 30 days)
    const CalendarEvent = db.sequelize.models.CalendarEvent || require('../models/CalendarEvent');
    let calendarEvents = [];
    if (CalendarEvent) {
      calendarEvents = await CalendarEvent.findAll({
        where: { 
          userId: { [Op.in]: employeeIds },
          startTime: { [Op.gte]: thirtyDaysAgo }
        },
        attributes: ['userId', 'startTime', 'endTime', 'attendees'],
        order: [['startTime', 'ASC']]
      });
    }

    // Slack (last 30 days)
    const SlackActivity = db.sequelize.models.SlackActivity || require('../models/SlackActivity');
    let slackActivity = [];
    if (SlackActivity) {
      slackActivity = await SlackActivity.findAll({
        where: { userId: { [Op.in]: employeeIds } }
      });
    }

    // Jira Issues via integrations
    const JiraIssue = db.sequelize.models.JiraIssue || require('../models/JiraIssue');
    const JiraIntegration = db.sequelize.models.JiraIntegration || require('../models/JiraIntegration');
    let jiraIssues = [];
    const integrationByUser = new Map();
    if (JiraIssue && JiraIntegration) {
      const integrations = await JiraIntegration.findAll({
        where: { userId: { [Op.in]: employeeIds } },
        attributes: ['id', 'userId']
      });
      integrations.forEach(i => {
        if (!integrationByUser.has(i.userId)) integrationByUser.set(i.userId, []);
        integrationByUser.get(i.userId).push(i.id);
      });
      const integrationIds = integrations.map(i => i.id);
      if (integrationIds.length) {
        jiraIssues = await JiraIssue.findAll({
          where: { integrationId: { [Op.in]: integrationIds } },
          attributes: ['integrationId', 'status', 'resolutionDate', 'createdDate']
        });
      }
    }

    // Calculate Baseline Averages per Employee
    const employeeBaselines = [];
    const employeeMeta = [];
    employeeIds.forEach(uid => {
      const userCheckins = checkins.filter(c => c.userId === uid);
      const userEvents = calendarEvents.filter(e => e.userId === uid);
      const userSlack = slackActivity.filter(s => s.userId === uid);

      const focusMetrics = calculateFocusMetrics(userEvents);
      const avgMeetingHours = average(focusMetrics.map(f => f.meeting_hours), 0);
      const avgFragmented = average(focusMetrics.map(f => f.fragmented_hours + f.medium_hours), 0);
      const avgFocus = average(focusMetrics.map(f => f.focus_hours), 0);

      const avgSlack = average(userSlack.map(s => s.messageCount), 0);

      // Jira workload per user (using integration mapping)
      let activeTickets = 0;
      const userIntegrationIds = integrationByUser.get(uid) || [];
      if (userIntegrationIds.length) {
        activeTickets = jiraIssues.filter(i => userIntegrationIds.includes(i.integrationId) && !i.resolutionDate).length;
      }

      if (userCheckins.length > 0) {
        const sum = userCheckins.reduce((acc, c) => ({
          stress: acc.stress + (c.stress || 0),
          energy: acc.energy + (c.energy || 0),
          sleepQuality: acc.sleepQuality + (c.sleepQuality || 0),
          risk: acc.risk + ((c.stress || 0) + (100 - (c.energy || 50))) / 2
        }), { stress: 0, energy: 0, sleepQuality: 0, risk: 0 });

        const count = userCheckins.length;
        const avgStress = sum.stress / count;
        const avgEnergy = sum.energy / count;
        const avgSleepQuality = sum.sleepQuality / count;
        const avgRisk = sum.risk / count;

        employeeBaselines.push({
          stress: clamp(avgStress / 10, 1, 10),
          sleep: clamp((avgSleepQuality || 3) * 2, 4, 10),
          workload: clamp(3 + (avgMeetingHours / 2) + (activeTickets / 5) + (avgSlack / 30), 1, 10),
          risk: clamp(avgRisk, 0, 100)
        });

        employeeMeta.push({
          meetingHours: avgMeetingHours,
          fragmentedHours: avgFragmented,
          focusHours: avgFocus,
          slackMessages: avgSlack,
          activeTickets,
          risk: avgRisk
        });
      }
    });

    // If no data, use industry defaults
    if (employeeBaselines.length === 0) {
      employeeBaselines.push({ stress: 6, sleep: 7, workload: 6, risk: 60 });
      employeeMeta.push({
        meetingHours: 10,
        fragmentedHours: 3,
        focusHours: 3,
        slackMessages: 40,
        activeTickets: 6,
        risk: 60
      });
    }

    console.time('MonteCarloSimulation');
    // 2. Run Simulation via Service
    const { timeline, estimatedCost } = SimulationService.runMonteCarlo(employeeBaselines, plan || {});
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

    let trend = 'Flat';
    if (delta > 0) {
      trend = 'Improving';
    } else if (delta < 0) {
      trend = 'Worsening';
    }

    const baseline = {
      meetingHours: average(employeeMeta.map(e => e.meetingHours), 0),
      fragmentedHours: average(employeeMeta.map(e => e.fragmentedHours), 0),
      focusHours: average(employeeMeta.map(e => e.focusHours), 0),
      slackMessages: average(employeeMeta.map(e => e.slackMessages), 0),
      activeTickets: average(employeeMeta.map(e => e.activeTickets), 0),
      risk: average(employeeMeta.map(e => e.risk), startRisk)
    };

    const actionEffects = applyEmployerActions(baseline, (plan?.actions || []));
    const projected = {
      meetingHours: actionEffects.projectedMeetingHours,
      fragmentedHours: actionEffects.projectedFragmented,
      focusHours: actionEffects.projectedFocus,
      slackMessages: actionEffects.projectedSlack,
      activeTickets: actionEffects.projectedTickets,
      risk: endRisk
    };

    const baselineWasted = baseline.meetingHours + baseline.fragmentedHours;
    const projectedWasted = projected.meetingHours + projected.fragmentedHours;
    const weeklyHoursSaved = Math.max(0, baselineWasted - projectedWasted);
    const hourlyRate = Number(plan?.avgHourlyRate || 50);
    const durationWeeks = Number(plan?.durationWeeks || 12);
    const estimatedSavings = Math.round(weeklyHoursSaved * hourlyRate * durationWeeks);

    res.json({
      timeline,
      baseline,
      projected,
      metrics: {
        deltaPercent: deltaPercent.toFixed(1),
        timeToImpact: impactDay > -1 ? impactDay : null,
        volatility: volatility.toFixed(2),
        trend,
        estimatedCost: Math.round(estimatedCost || 0),
        estimatedSavings,
        weeklyHoursSaved: weeklyHoursSaved.toFixed(1),
        projectDeadline: plan?.projectDeadline || null
      }
    });

  } catch (error) {
    console.error("Simulation error:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
