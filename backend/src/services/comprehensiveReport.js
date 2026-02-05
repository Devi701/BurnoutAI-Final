const { parseISO, differenceInMinutes, startOfDay, format, addDays, isSameDay, getDay, getHours, isValid } = require('date-fns');

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

// Helper: Calculate Focus Metrics
function calculateFocusMetrics(calendarEvents) {
    if (!calendarEvents || calendarEvents.length === 0) return [];

    // Group by date
    const eventsByDate = {};
    calendarEvents.forEach(e => {
        const start = parseISO(e.startTime);
        const end = parseISO(e.endTime);
        if (!isValid(start) || !isValid(end)) return;
        const dateKey = format(start, 'yyyy-MM-dd');
        if (!eventsByDate[dateKey]) eventsByDate[dateKey] = [];
        eventsByDate[dateKey].push({ start, end });
    });

    const results = [];
    Object.keys(eventsByDate).forEach(date => {
        const events = eventsByDate[date].sort((a, b) => a.start - b.start);
        
        // Merge overlaps
        const merged = [];
        if (events.length > 0) {
            let current = events[0];
            for (let i = 1; i < events.length; i++) {
                const next = events[i];
                if (next.start < current.end) {
                    current.end = new Date(Math.max(current.end, next.end));
                } else {
                    merged.push(current);
                    current = next;
                }
            }
            merged.push(current);
        }

        let meetingHours = 0;
        let fragmentedHours = 0;

        merged.forEach(m => {
            meetingHours += differenceInMinutes(m.end, m.start) / 60;
        });

        // Calculate gaps
        for (let i = 0; i < merged.length - 1; i++) {
            const gap = differenceInMinutes(merged[i+1].start, merged[i].end);
            if (gap > 0 && gap < 30) {
                fragmentedHours += gap / 60;
            }
        }

        const focusHours = Math.max(0, 8.0 - meetingHours - fragmentedHours);

        results.push({
            date,
            meeting_hours: meetingHours,
            fragmented_hours: fragmentedHours,
            focus_hours: focusHours
        });
    });

    return results.sort((a, b) => a.date.localeCompare(b.date));
}

function analyze(data) {
    const graphs = {};
    const stats = {};
    
    // 1. Process Focus Metrics
    const dailyFocus = calculateFocusMetrics(data.calendar || []);
    
    // 2. Process Checkins
    const checkins = data.checkins || [];
    const dailyWellness = {}; // date -> { stress: [], energy: [], sleepQuality: [] }
    
    checkins.forEach(c => {
        const d = parseISO(c.createdAt);
        if (!isValid(d)) return;
        const dateKey = format(d, 'yyyy-MM-dd');
        if (!dailyWellness[dateKey]) dailyWellness[dateKey] = { stress: [], energy: [], sleepQuality: [] };
        if (c.stress != null) dailyWellness[dateKey].stress.push(c.stress);
        if (c.energy != null) dailyWellness[dateKey].energy.push(c.energy);
        if (c.sleepQuality != null) dailyWellness[dateKey].sleepQuality.push(c.sleepQuality);
    });

    // Aggregate Daily Data
    const allDates = new Set([...dailyFocus.map(d => d.date), ...Object.keys(dailyWellness)]);
    const sortedDates = Array.from(allDates).sort();
    
    const dailyData = sortedDates.map(date => {
        const focus = dailyFocus.find(d => d.date === date) || { meeting_hours: 0, fragmented_hours: 0, focus_hours: 0 };
        const wellness = dailyWellness[date] || {};
        
        const avg = (arr) => arr && arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
        
        return {
            date,
            meeting_hours: focus.meeting_hours,
            fragmented_hours: focus.fragmented_hours,
            focus_hours: focus.focus_hours,
            stress: avg(wellness.stress) || 0,
            energy: avg(wellness.energy) || 0,
            sleepQuality: avg(wellness.sleepQuality) || 0
        };
    });

    // Stats
    const validStress = dailyData.filter(d => d.stress > 0);
    const validEnergy = dailyData.filter(d => d.energy > 0);
    stats.avg_stress = validStress.length ? validStress.reduce((a,b)=>a+b.stress,0)/validStress.length : 0;
    stats.avg_energy = validEnergy.length ? validEnergy.reduce((a,b)=>a+b.energy,0)/validEnergy.length : 0;
    stats.data_points = dailyData.length;
    
    if (dailyFocus.length) {
        stats.avg_focus_hours = dailyFocus.reduce((a,b)=>a+b.focus_hours,0)/dailyFocus.length;
        stats.avg_fragmented_hours = dailyFocus.reduce((a,b)=>a+b.fragmented_hours,0)/dailyFocus.length;
    }

    // Correlation
    const stressVals = dailyData.map(d => d.stress);
    const meetingVals = dailyData.map(d => d.meeting_hours);
    stats.meeting_stress_correlation = calculateCorrelation(meetingVals, stressVals);

    // Generate Graph Data (Instead of Images)
    
    // 1. Stress vs Meetings
    graphs.stress_vs_meetings = {
        labels: dailyData.map(d => d.date),
        datasets: [
            { label: 'Avg Stress', data: dailyData.map(d => d.stress), type: 'line' },
            { label: 'Meeting Hours', data: dailyData.map(d => d.meeting_hours), type: 'bar' }
        ]
    };

    // 2. Focus Breakdown
    graphs.focus_time_breakdown = {
        labels: dailyData.map(d => d.date),
        datasets: [
            { label: 'Meetings', data: dailyData.map(d => d.meeting_hours) },
            { label: 'Fragmented', data: dailyData.map(d => d.fragmented_hours) },
            { label: 'Deep Focus', data: dailyData.map(d => d.focus_hours) }
        ]
    };

    // 3. Workload (Jira)
    const jiraData = data.jira || [];
    if (jiraData.length > 0) {
        const workloadByAssignee = {};
        jiraData.forEach(issue => {
            const assignee = issue.assignee || 'Unassigned';
            const points = parseFloat(issue.storyPoints) || 0;
            workloadByAssignee[assignee] = (workloadByAssignee[assignee] || 0) + points;
        });
        
        graphs.workload_by_assignee = {
            labels: Object.keys(workloadByAssignee),
            datasets: [{ label: 'Story Points', data: Object.values(workloadByAssignee) }]
        };
    }

    return { stats, graphs, daily_data: dailyData };
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