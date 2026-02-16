const { parseISO, differenceInMinutes, startOfDay, format, addDays, isSameDay, getDay, getHours, isValid, isAfter, isBefore } = require('date-fns');

function toValidDate(value) {
    if (!value) return null;
    if (value instanceof Date) return isValid(value) ? value : null;
    if (typeof value === 'number') {
        const d = new Date(value);
        return isValid(d) ? d : null;
    }
    if (typeof value === 'string') {
        const parsedIso = parseISO(value);
        if (isValid(parsedIso)) return parsedIso;
        const fallback = new Date(value);
        return isValid(fallback) ? fallback : null;
    }
    return null;
}

// Helper: Calculate Pearson Correlation
function calculateCorrelation(x, y) {
    if (x.length !== y.length || x.length < 2) return 0;
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
    const numerator = (n * sumXY) - (sumX * sumY);
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    return denominator === 0 ? 0 : numerator / denominator;
}

// Helper: Meeting Density Heatmap (Item 2)
function calculateMeetingDensity(calendarEvents) {
    // Grid: 7 days (0=Sun, 6=Sat) x 24 hours
    const grid = Array(7).fill(null).map(() => Array(24).fill(0));
    
    calendarEvents.forEach(e => {
        const start = toValidDate(e.startTime);
        if (isValid(start)) {
            const day = getDay(start);
            const hour = getHours(start);
            grid[day][hour]++;
        }
    });
    return grid;
}

// Helper: Calculate Focus Metrics
function calculateFocusMetrics(calendarEvents) {
    if (!calendarEvents || calendarEvents.length === 0) return [];

    // Group by date
    const eventsByDate = {};
    calendarEvents.forEach(e => {
        const start = toValidDate(e.startTime);
        const end = toValidDate(e.endTime);
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
        let largeMeetings = 0;
        let backToBack = 0;
        
        // Metrics for Focus vs Fragmented (Item 9)
        let mediumBlockTime = 0; // 30-90m
        let fragmentedBlockTime = 0; // < 30m (gaps)

        const merged = [];
        if (events.length > 0) {
            let current = { ...events[0] };
            if (current.attendeeCount > 8) largeMeetings++;

            for (let i = 1; i < events.length; i++) {
                const next = events[i];
                if (next.attendeeCount > 8) largeMeetings++;

                // Check gap between raw events for back-to-back (<15 min)
                const gapRaw = differenceInMinutes(next.start, events[i-1].end);
                if (gapRaw >= 0 && gapRaw < 15) backToBack++;

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

        // Calculate gaps (Item 9)
        for (let i = 0; i < merged.length - 1; i++) {
            const gap = differenceInMinutes(merged[i+1].start, merged[i].end);
            if (gap >= 30 && gap < 90) {
                mediumBlockTime += gap / 60;
            } else if (gap > 0 && gap < 30) {
                fragmentedBlockTime += gap / 60;
            }
        }

        // Deep Focus = Remaining time in 8h day not spent in meetings or fragmented gaps
        const focusHours = Math.max(0, 8.0 - meetingHours - fragmentedBlockTime - mediumBlockTime);

        // Chaos Score (Item 7)
        // (meeting_hours × 1) + (back_to_back × 2) + (large_meetings × 1.5)
        const chaosScore = (meetingHours * 1) + (backToBack * 2) + (largeMeetings * 1.5);

        results.push({
            date,
            meeting_hours: meetingHours,
            fragmented_hours: fragmentedBlockTime,
            medium_hours: mediumBlockTime,
            focus_hours: focusHours,
            chaos_score: chaosScore,
            large_meetings: largeMeetings,
            back_to_back: backToBack
        });
    });

    return results.sort((a, b) => a.date.localeCompare(b.date));
}

// Helper: Calculate Energy Distribution by Hour (Boxplots)
function calculateEnergyByHour(checkins) {
    const hourlyData = Array(24).fill(null).map(() => []);
    
    checkins.forEach(c => {
        if (c.energy != null && c.createdAt) {
            const date = toValidDate(c.createdAt);
            if (isValid(date)) {
                const hour = getHours(date);
                hourlyData[hour].push(c.energy);
            }
        }
    });

    return hourlyData.map((values, hour) => {
        if (values.length === 0) return { hour, min: 0, q1: 0, median: 0, q3: 0, max: 0, count: 0 };
        values.sort((a, b) => a - b);
        const q1 = values[Math.floor(values.length * 0.25)];
        const median = values[Math.floor(values.length * 0.5)];
        const q3 = values[Math.floor(values.length * 0.75)];
        return {
            hour,
            min: values[0],
            q1,
            median,
            q3,
            max: values[values.length - 1],
            count: values.length
        };
    });
}

// Helper: Calculate Work In Progress (WIP)
function calculateWIP(jiraIssues, dates) {
    return dates.map(dateStr => {
        const date = toValidDate(dateStr);
        if (!isValid(date)) {
            return { date: dateStr, activeTickets: 0, pointsInProgress: 0, backlogCount: 0 };
        }
        let activeTickets = 0;
        let pointsInProgress = 0;
        let backlogCount = 0;

        jiraIssues.forEach(issue => {
            const created = toValidDate(issue.created);
            const resolved = issue.resolutionDate ? toValidDate(issue.resolutionDate) : null;
            const points = parseFloat(issue.storyPoints) || 0;
            if (!isValid(created)) return;

            // Check if ticket existed on this date
            if (isBefore(created, addDays(date, 1))) {
                const isResolved = resolved && isBefore(resolved, addDays(date, 1));
                
                if (!isResolved) {
                    activeTickets++;
                    pointsInProgress += points;
                    
                    // Simple heuristic for backlog: created but not resolved
                    // In a real app, we'd check status history
                    if (issue.status === 'To Do' || issue.status === 'Backlog') {
                        backlogCount++;
                    }
                }
            }
        });

        return { date: dateStr, activeTickets, pointsInProgress, backlogCount };
    });
}

// Helper: Deadline Risk (Item 8)
function calculateDeadlineRisk(jiraIssues) {
    // 1. Calculate Velocity (Avg points completed per week in last 6 weeks)
    const now = new Date();
    const sixWeeksAgo = addDays(now, -42);
    
    const completedRecently = jiraIssues.filter(i => {
        if (!i.resolutionDate) return false;
        const d = toValidDate(i.resolutionDate);
        if (!isValid(d)) return false;
        return isAfter(d, sixWeeksAgo) && isBefore(d, now);
    });

    const totalCompletedPoints = completedRecently.reduce((sum, i) => sum + (parseFloat(i.storyPoints) || 0), 0);
    const velocityPerWeek = totalCompletedPoints / 6; // Simple average

    // 2. Calculate Backlog
    const backlogIssues = jiraIssues.filter(i => !i.resolutionDate && (i.status === 'To Do' || i.status === 'Backlog' || i.status === 'In Progress'));
    const backlogPoints = backlogIssues.reduce((sum, i) => sum + (parseFloat(i.storyPoints) || 0), 0);

    // 3. Projection
    const weeksToComplete = velocityPerWeek > 0 ? backlogPoints / velocityPerWeek : 0;
    const projectedDate = addDays(now, weeksToComplete * 7);

    return {
        velocity: velocityPerWeek,
        backlogPoints,
        weeksToComplete,
        projectedDate: format(projectedDate, 'yyyy-MM-dd')
    };
}

// Helper: Calculate Context Switching Score (Timestamp-based)
function calculateContextSwitchingScore(calendar, jira, checkins) {
    const dailyScores = {};

    // Normalize events
    const meetings = calendar.map(e => {
        const start = toValidDate(e.startTime);
        const end = toValidDate(e.endTime);
        if (!isValid(start) || !isValid(end)) return null;
        return { start, end, date: format(start, 'yyyy-MM-dd') };
    }).filter(Boolean);

    const activities = [];
    jira.forEach(j => {
        const created = toValidDate(j.created);
        const updated = toValidDate(j.updated);
        if (isValid(created)) activities.push({ time: created, type: 'jira', date: format(created, 'yyyy-MM-dd') });
        if (isValid(updated)) activities.push({ time: updated, type: 'jira', date: format(updated, 'yyyy-MM-dd') });
    });
    checkins.forEach(c => {
        const createdAt = toValidDate(c.createdAt);
        if (isValid(createdAt)) activities.push({ time: createdAt, type: 'checkin', date: format(createdAt, 'yyyy-MM-dd') });
    });

    // Process by date
    const allDates = new Set([...meetings.map(m => m.date), ...activities.map(a => a.date)]);
    
    allDates.forEach(date => {
        let score = 0;
        const dayMeetings = meetings.filter(m => m.date === date);
        const dayActivities = activities.filter(a => a.date === date);

        dayActivities.forEach(act => {
            // 1. Multitasking Penalty (Activity during meeting)
            const inMeeting = dayMeetings.some(m => isAfter(act.time, m.start) && isBefore(act.time, m.end));
            if (inMeeting) score += 2; // High penalty

            // 2. Fragmented Switching (Activity close to meeting boundary < 15m)
            const nearBoundary = dayMeetings.some(m => {
                const distStart = Math.abs(differenceInMinutes(act.time, m.start));
                const distEnd = Math.abs(differenceInMinutes(act.time, m.end));
                return (distStart > 0 && distStart < 15) || (distEnd > 0 && distEnd < 15);
            });
            if (nearBoundary) score += 1;
        });

        dailyScores[date] = score;
    });

    return dailyScores;
}

function analyze(data) {
    const graphs = {};
    const stats = {};
    const recommendations = [];

    // 1. Detect Data Sources
    const hasCheckins = Array.isArray(data.checkins) && data.checkins.length > 0;
    const hasCalendar = Array.isArray(data.calendar) && data.calendar.length > 0;
    const hasJira = Array.isArray(data.jira) && data.jira.length > 0;
    const hasSlack = Array.isArray(data.slack) && data.slack.length > 0;

    const dataSources = {
        checkins: hasCheckins,
        calendar: hasCalendar,
        jira: hasJira,
        slack: hasSlack
    };

    // Minimum Requirement: Tier 1 (Check-ins)
    if (!hasCheckins) {
        return {
            error: "No check-in data available. Please complete daily check-ins to generate a report.",
            data_sources: dataSources,
            stats: {},
            graphs: {},
            daily_data: [],
            correlations: { labels: [], matrix: [] },
            recommendations: ["Start by completing your daily check-ins to unlock insights."]
        };
    }
    
    // 2. Process Data (Conditional based on Tiers)
    
    // Tier 1: Checkins Processing
    const checkins = data.checkins || [];
    const dailyWellness = {}; // date -> { stress: [], energy: [], sleepQuality: [] }
    
    checkins.forEach(c => {
        const d = toValidDate(c.createdAt);
        if (!isValid(d)) return;
        const dateKey = format(d, 'yyyy-MM-dd');
        if (!dailyWellness[dateKey]) dailyWellness[dateKey] = { stress: [], energy: [], sleepQuality: [] };
        if (c.stress != null) dailyWellness[dateKey].stress.push(c.stress);
        if (c.energy != null) dailyWellness[dateKey].energy.push(c.energy);
        if (c.sleepQuality != null) dailyWellness[dateKey].sleepQuality.push(c.sleepQuality);
    });

    // Tier 2: Calendar Processing
    let dailyFocus = [];
    let meetingDensity = [];
    if (hasCalendar) {
        dailyFocus = calculateFocusMetrics(data.calendar);
        meetingDensity = calculateMeetingDensity(data.calendar);
    }

    // Tier 3: Jira Processing (Defer WIP calc until dates are known)
    let deadlineRisk = null;
    if (hasJira) {
        deadlineRisk = calculateDeadlineRisk(data.jira);
    }

    // Tier 4: Slack Processing
    const slackData = hasSlack ? data.slack : [];

    // Context Switching (Requires Calendar + (Jira OR Checkins))
    let contextScores = {};
    if (hasCalendar) {
        contextScores = calculateContextSwitchingScore(data.calendar, data.jira || [], checkins);
    }

    // Aggregate Dates from all available sources
    const allDates = new Set(Object.keys(dailyWellness));
    dailyFocus.forEach(d => allDates.add(d.date));
    slackData.forEach(s => allDates.add(s.date));
    
    const sortedDates = Array.from(allDates).sort();
    
    // Calculate WIP now that we have the date range
    let wipData = [];
    if (hasJira) {
        wipData = calculateWIP(data.jira, sortedDates);
    }

    const dailyData = sortedDates.map(date => {
        // Safe access with fallbacks
        const wellness = dailyWellness[date] || {};
        const focus = hasCalendar ? (dailyFocus.find(d => d.date === date) || { meeting_hours: 0, fragmented_hours: 0, medium_hours: 0, focus_hours: 0, chaos_score: 0 }) : { meeting_hours: 0, fragmented_hours: 0, medium_hours: 0, focus_hours: 0, chaos_score: 0 };
        const slack = hasSlack ? (slackData.find(s => s.date === date) || { messageCount: 0 }) : { messageCount: 0 };
        
        // Find WIP for this date index (wipData aligns with sortedDates)
        const wipIndex = sortedDates.indexOf(date);
        const wip = (hasJira && wipData[wipIndex]) ? wipData[wipIndex] : { activeTickets: 0, pointsInProgress: 0 };
        
        const contextScore = hasCalendar ? (contextScores[date] || 0) : 0;
        
        const avg = (arr) => arr && arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
        
        const stress = avg(wellness.stress) || 0;
        const energy = avg(wellness.energy) || 0;
        const burnoutRisk = (stress + (100 - energy)) / 2;

        return {
            date,
            // Tier 1
            stress,
            energy,
            sleepQuality: avg(wellness.sleepQuality) || 0,
            burnout_risk: burnoutRisk,

            // Tier 2
            meeting_hours: focus.meeting_hours,
            fragmented_hours: focus.fragmented_hours,
            medium_hours: focus.medium_hours || 0,
            focus_hours: focus.focus_hours,
            chaos_score: focus.chaos_score || 0,
            
            // Tier 3
            active_tickets: wip.activeTickets,
            points_in_progress: wip.pointsInProgress,

            // Tier 4
            slack_messages: slack.messageCount,

            // Derived
            context_switching_score: contextScore,
            is_after_hours_heavy: false // Will calculate below
        };
    });

    // 3. Calculate Stats
    const validStress = dailyData.filter(d => d.stress > 0);
    const validEnergy = dailyData.filter(d => d.energy > 0);
    stats.avg_stress = validStress.length ? validStress.reduce((a,b)=>a+b.stress,0)/validStress.length : 0;
    stats.avg_energy = validEnergy.length ? validEnergy.reduce((a,b)=>a+b.energy,0)/validEnergy.length : 0;
    stats.data_points = dailyData.length;
    
    if (hasCalendar && dailyFocus.length) {
        stats.avg_focus_hours = dailyFocus.reduce((a,b)=>a+b.focus_hours,0)/dailyFocus.length;
        stats.avg_fragmented_hours = dailyFocus.reduce((a,b)=>a+b.fragmented_hours,0)/dailyFocus.length;
    }

    // Calculate After-Hours Flags (Tier 4)
    if (hasSlack) {
        const slackCounts = dailyData.map(d => d.slack_messages);
        const avgSlack = slackCounts.reduce((a,b) => a+b, 0) / (slackCounts.length || 1);
        const stdDevSlack = Math.sqrt(slackCounts.reduce((a,b) => a + Math.pow(b - avgSlack, 2), 0) / (slackCounts.length || 1));
        
        dailyData.forEach(d => {
            if (d.slack_messages > avgSlack + stdDevSlack) d.is_after_hours_heavy = true;
        });
    }

    // 4. Generate Graphs (Conditional)

    // --- TIER 1: ALWAYS AVAILABLE ---
    
    // 1. Burnout Risk Trend
    graphs.burnout_risk_trend = {
        labels: dailyData.map(d => d.date),
        datasets: [
            { label: 'Burnout Risk', data: dailyData.map(d => d.burnout_risk), borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true }
        ]
    };

    // 2. Energy by Hour (Boxplot)
    const hourlyEnergy = calculateEnergyByHour(checkins);
    graphs.energy_by_hour = {
        labels: Array.from({length: 24}, (_, i) => `${i}:00`),
        datasets: [
            { 
                label: 'Energy Distribution', 
                data: hourlyEnergy.map(h => ({ min: h.min, q1: h.q1, median: h.median, q3: h.q3, max: h.max, count: h.count })),
                type: 'boxplot'
            }
        ]
    };

    // 3. Stress Trend
    graphs.stress_trend = {
        labels: dailyData.map(d => d.date),
        datasets: [
            { label: 'Stress Level', data: dailyData.map(d => d.stress), borderColor: '#f97316', tension: 0.4 }
        ]
    };

    // --- TIER 2: CALENDAR GRAPHS ---
    if (hasCalendar) {
        // 5. Stress vs Meetings (Dual Axis)
        graphs.stress_vs_meetings = {
            labels: dailyData.map(d => d.date),
            datasets: [
                { label: 'Avg Stress', data: dailyData.map(d => d.stress), type: 'line', yAxisID: 'y' },
                { label: 'Meeting Hours', data: dailyData.map(d => d.meeting_hours), type: 'bar', yAxisID: 'y1' }
            ]
        };

        // 6. Meeting Density Heatmap
        graphs.meeting_density = {
            labels: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
            data: meetingDensity
        };

        // 7. Focus Time vs Fragmented Time
        graphs.focus_time_breakdown = {
            labels: dailyData.map(d => d.date),
            datasets: [
                { label: 'Deep Focus (>90m)', data: dailyData.map(d => d.focus_hours), backgroundColor: '#10b981' },
                { label: 'Medium Blocks (30-90m)', data: dailyData.map(d => d.medium_hours), backgroundColor: '#3b82f6' },
                { label: 'Fragmented (<30m)', data: dailyData.map(d => d.fragmented_hours), backgroundColor: '#f59e0b' },
                { label: 'Meetings', data: dailyData.map(d => d.meeting_hours), backgroundColor: '#ef4444' }
            ]
        };

        // 8. Calendar Chaos Score
        graphs.calendar_chaos = {
            labels: dailyData.map(d => d.date),
            datasets: [
                { label: 'Chaos Score', data: dailyData.map(d => d.chaos_score), borderColor: '#ef4444', fill: true, backgroundColor: 'rgba(239, 68, 68, 0.1)' }
            ]
        };

        // Context Switching (Requires Calendar)
        graphs.context_switching = {
            labels: dailyData.map(d => d.date),
            datasets: [
                { label: 'Context Switching Score', data: dailyData.map(d => d.context_switching_score), borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.1)', fill: true }
            ]
        };
    }

    // --- TIER 3: JIRA GRAPHS ---
    if (hasJira) {
        // 9. WIP & Backlog Growth
        graphs.wip_growth = {
            labels: wipData.map(d => d.date),
            datasets: [
                { label: 'Active Tickets', data: wipData.map(d => d.activeTickets), borderColor: '#3b82f6' },
                { label: 'Story Points (Load)', data: wipData.map(d => d.pointsInProgress), borderColor: '#f59e0b', type: 'line', borderDash: [5, 5] }
            ]
        };

        // 10. Deadline Risk (Stat)
        stats.deadline_risk = deadlineRisk;

        // Workload by Assignee (Extra)
        const workloadByAssignee = {};
        data.jira.forEach(issue => {
            const assignee = issue.assignee || 'Unassigned';
            const points = parseFloat(issue.storyPoints) || 0;
            workloadByAssignee[assignee] = (workloadByAssignee[assignee] || 0) + points;
        });
        graphs.workload_by_assignee = {
            labels: Object.keys(workloadByAssignee),
            datasets: [{ label: 'Story Points', data: Object.values(workloadByAssignee) }]
        };
    }

    // --- TIER 4: SLACK GRAPHS ---
    if (hasSlack) {
        // 12. After-Hours Activity
        graphs.after_hours_activity = {
            labels: dailyData.map(d => d.date),
            datasets: [
                { 
                    label: 'Total Slack Activity', 
                    data: dailyData.map(d => d.slack_messages),
                    backgroundColor: dailyData.map(d => d.is_after_hours_heavy ? '#ef4444' : '#3b82f6')
                }
            ]
        };
    }

    // 5. Correlations (Dynamic based on available data)
    const stressVals = dailyData.map(d => d.stress);
    
    // Specific Correlations for Stats
    if (hasCalendar) {
        const meetingVals = dailyData.map(d => d.meeting_hours);
        const contextVals = dailyData.map(d => d.context_switching_score);
        stats.meeting_stress_correlation = calculateCorrelation(meetingVals, stressVals);
        stats.context_stress_correlation = calculateCorrelation(contextVals, stressVals);
    }
    if (hasJira) {
        const ticketVals = dailyData.map(d => d.active_tickets);
        stats.workload_stress_correlation = calculateCorrelation(ticketVals, stressVals);
    }

    // Full Correlation Matrix
    const metrics = ['stress', 'energy', 'sleepQuality'];
    if (hasCalendar) metrics.push('meeting_hours');
    if (hasJira) metrics.push('active_tickets');
    if (hasSlack) metrics.push('slack_messages');
    if (hasCalendar && (hasJira || hasCheckins)) metrics.push('context_switching_score');

    const matrix = [];
    
    metrics.forEach(rowMetric => {
        const row = [];
        metrics.forEach(colMetric => {
            if (rowMetric === colMetric) {
                row.push(1);
            } else {
                const v1 = dailyData.map(d => d[rowMetric]);
                const v2 = dailyData.map(d => d[colMetric]);
                row.push(parseFloat(calculateCorrelation(v1, v2).toFixed(2)));
            }
        });
        matrix.push({ metric: rowMetric, values: row });
    });

    // 6. Recommendations
    if (!hasCalendar) recommendations.push("Connect Google Calendar to see meeting patterns and focus time analysis.");
    if (!hasJira) recommendations.push("Connect Jira to see workload trends and deadline risks.");
    if (!hasSlack) recommendations.push("Connect Slack to see after-hours communication patterns.");

    return { 
        stats, 
        graphs, 
        daily_data: dailyData,
        correlations: { labels: metrics, matrix },
        data_sources: dataSources,
        recommendations
    };
}

module.exports = { analyze };

// Allow running as a script via stdin for backward compatibility
if (require.main === module) {
    const chunks = [];
    process.stdin.on('data', chunk => chunks.push(chunk));
    process.stdin.on('end', () => {
        try {
            const input = JSON.parse(Buffer.concat(chunks).toString());
            const result = analyze(input);
            console.log(JSON.stringify(result));
        } catch (e) {
            console.error(JSON.stringify({ error: e.message }));
            process.exit(1);
        }
    });
}
