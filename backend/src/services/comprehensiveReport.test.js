const { analyze } = require('./comprehensiveReport');

describe('Comprehensive Report Analysis', () => {
  const mockData = {
    calendar: [
      { startTime: '2023-10-01T09:00:00Z', endTime: '2023-10-01T10:00:00Z' }, // 1 hour meeting
      { startTime: '2023-10-01T10:15:00Z', endTime: '2023-10-01T11:15:00Z' }, // 1 hour meeting, 15m gap (fragmented)
      { startTime: '2023-10-02T14:00:00Z', endTime: '2023-10-02T15:00:00Z' }
    ],
    checkins: [
      { createdAt: '2023-10-01T08:00:00Z', stress: 80, energy: 40, sleepQuality: 5 },
      { createdAt: '2023-10-01T18:00:00Z', stress: 60, energy: 30, sleepQuality: null },
      { createdAt: '2023-10-02T09:00:00Z', stress: 40, energy: 80, sleepQuality: 8 }
    ],
    jira: [
      { created: '2023-09-28T10:00:00Z', resolutionDate: '2023-10-03T10:00:00Z', storyPoints: 5, status: 'Done' },
      { created: '2023-10-01T12:00:00Z', resolutionDate: null, storyPoints: 3, status: 'In Progress' }
    ],
    slack: [
      { date: '2023-10-01', messageCount: 50, channelCount: 5 },
      { date: '2023-10-02', messageCount: 20, channelCount: 2 }
    ]
  };

  const result = analyze(mockData);

  test('should calculate daily stats correctly', () => {
    const day1 = result.daily_data.find(d => d.date === '2023-10-01');
    expect(day1).toBeDefined();
    expect(day1.stress).toBe(70); // Avg of 80 and 60
    expect(day1.energy).toBe(35); // Avg of 40 and 30
    expect(day1.meeting_hours).toBe(2);
    expect(day1.fragmented_hours).toBe(0.25); // 15 mins
    expect(day1.slack_messages).toBe(50);
  });

  test('should calculate WIP correctly', () => {
    const day1 = result.daily_data.find(d => d.date === '2023-10-01');
    // Ticket 1 (created Sep 28) is active. Ticket 2 (created Oct 1) is active.
    // Total active = 2. Points = 5 + 3 = 8.
    expect(day1.active_tickets).toBe(2);
    expect(day1.points_in_progress).toBe(8);

    const day2 = result.daily_data.find(d => d.date === '2023-10-02');
    expect(day2.active_tickets).toBe(2); // Both still active
  });

  test('should generate energy by hour boxplot data', () => {
    const graph = result.graphs.energy_by_hour;
    expect(graph).toBeDefined();
    expect(graph.labels.length).toBe(24);
    
    // Check 8 AM (Hour 8) - Energy 40
    // Note: getHours uses local time or UTC depending on parsing. 
    // parseISO parses 'Z' as UTC. getHours returns local time of the server running the test.
    // To make this robust, we assume the test runs in UTC or we check the data structure generally.
    
    const hasData = graph.datasets[0].data.some(d => d.count > 0);
    expect(hasData).toBe(true);
  });

  test('should generate correlation matrix', () => {
    const correlations = result.correlations;
    expect(correlations).toBeDefined();
    expect(correlations.labels).toContain('stress');
    expect(correlations.labels).toContain('meeting_hours');
    expect(correlations.matrix.length).toBe(correlations.labels.length);
    
    // Diagonal should be 1
    expect(correlations.matrix[0].values[0]).toBe(1);
  });

  test('should handle empty data gracefully', () => {
    const emptyResult = analyze({});
    expect(emptyResult.stats.avg_stress).toBe(0);
    expect(emptyResult.daily_data).toEqual([]);
    expect(emptyResult.graphs.stress_vs_meetings.labels).toEqual([]);
  });

  test('should calculate calendar chaos (fragmented hours)', () => {
    const chaosGraph = result.graphs.calendar_chaos;
    expect(chaosGraph).toBeDefined();
    
    // 2023-10-01 has 0.25 fragmented hours
    const day1Index = chaosGraph.labels.indexOf('2023-10-01');
    expect(chaosGraph.datasets[0].data[day1Index]).toBe(0.25);
  });

  test('should calculate correlations correctly', () => {
    // Stress: [70, 40], Meetings: [2, 1]
    // Both decrease together -> Positive correlation
    // (70, 2), (40, 1)
    // This is a perfect linear correlation (slope 30). R should be 1.
    expect(result.stats.meeting_stress_correlation).toBeCloseTo(1, 1);
  });
});