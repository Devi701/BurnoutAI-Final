import { describe, it, expect } from 'vitest';
import { normalizeExternalData, analyzeWorkPatterns } from './integrationService';

describe('Integration Service - Data Normalization', () => {
  it('calculates Jira workload score correctly', () => {
    const mockJira = { activeTickets: 4, overdueTickets: 1 };
    // Calculation: (4 * 5) + (1 * 15) = 20 + 15 = 35
    const score = normalizeExternalData('jira', mockJira);
    expect(score).toBe(35);
  });

  it('calculates Slack stress score correctly', () => {
    const mockSlack = { messagesSent: 100, afterHoursMessages: 2 };
    // Calculation: (100 / 10) + (2 * 8) = 10 + 16 = 26
    const score = normalizeExternalData('slack', mockSlack);
    expect(score).toBe(26);
  });

  it('caps the score at 100 (Max Risk)', () => {
    const mockOverload = { activeTickets: 50, overdueTickets: 10 };
    // Calculation: (50 * 5) + (10 * 15) = 250 + 150 = 400 -> Should cap at 100
    const score = normalizeExternalData('jira', mockOverload);
    expect(score).toBe(100);
  });

  it('returns 0 for unknown services', () => {
    const score = normalizeExternalData('unknown_service', { some: 'data' });
    expect(score).toBe(0);
  });
});

describe('Integration Service - Work Patterns', () => {
  it('identifies peak context switching hour', () => {
    const mockSlack = { hourlyActivity: new Array(24).fill(0) };
    const mockJira = { hourlyActivity: new Array(24).fill(0) };
    
    // 2 PM (14:00): High overlap
    mockSlack.hourlyActivity[14] = 10;
    mockJira.hourlyActivity[14] = 10;
    
    // 10 AM: High Slack, No Work (Distraction, not switching)
    mockSlack.hourlyActivity[10] = 10;
    mockJira.hourlyActivity[10] = 0;

    const result = analyzeWorkPatterns(mockSlack, mockJira);
    
    expect(result.peakContextSwitchingHour).toBe(14);
    expect(result.contextSwitchingScore).toBeGreaterThan(50);
  });

  it('calculates distraction level based on chat during work', () => {
    const mockSlack = { hourlyActivity: new Array(24).fill(0) };
    const mockJira = { hourlyActivity: new Array(24).fill(0) };
    
    // 9 AM: Work + Chat = Distraction
    mockJira.hourlyActivity[9] = 10;
    mockSlack.hourlyActivity[9] = 5;
    
    // 8 PM: Chat only = Not distraction from work
    mockSlack.hourlyActivity[20] = 20;

    const result = analyzeWorkPatterns(mockSlack, mockJira);
    
    // Should count the 5 messages at 9 AM, but ignore the 20 at 8 PM
    expect(result.distractionLevel).toBeGreaterThan(0);
    expect(result.distractionLevel).toBeLessThan(10); // Rough check: 5/2 = 2.5
  });
  
  it('returns zero values for missing data', () => {
      const result = analyzeWorkPatterns({}, {});
      expect(result.contextSwitchingScore).toBe(0);
  });
});