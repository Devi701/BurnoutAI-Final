import { describe, it, expect } from 'vitest';
import { fetchIntegrationData, normalizeExternalData, analyzeWorkPatterns } from './integrationService';

describe('End-to-End Integration & Inference Flow', () => {
  it('executes the full pipeline: Fetch -> Normalize -> Infer', async () => {
    // Step 1: Fetch Data from "External" APIs
    // We simulate fetching data from Slack and Jira concurrently
    const [slackData, jiraData] = await Promise.all([
      fetchIntegrationData('slack'),
      fetchIntegrationData('jira')
    ]);

    // Verification: Data structure integrity
    expect(slackData).toBeDefined();
    expect(jiraData).toBeDefined();
    expect(slackData).toHaveProperty('hourlyActivity');
    expect(jiraData).toHaveProperty('hourlyActivity');
    expect(slackData.hourlyActivity).toHaveLength(24);

    // Step 2: Normalize Data (Raw Metrics -> Risk Scores)
    const slackRiskScore = normalizeExternalData('slack', slackData);
    const jiraWorkloadScore = normalizeExternalData('jira', jiraData);

    // Verification: Scores are within standardized bounds (0-100)
    expect(slackRiskScore).toBeGreaterThanOrEqual(0);
    expect(slackRiskScore).toBeLessThanOrEqual(100);
    expect(jiraWorkloadScore).toBeGreaterThanOrEqual(0);
    expect(jiraWorkloadScore).toBeLessThanOrEqual(100);

    // Step 3: Advanced Inference (Cross-Platform Analysis)
    // Analyze how communication patterns overlap with workload to find "Context Switching"
    const inferences = analyzeWorkPatterns(slackData, jiraData);

    // Verification: Inference Engine Output
    expect(inferences).toHaveProperty('contextSwitchingScore');
    expect(inferences).toHaveProperty('peakContextSwitchingHour');
    expect(inferences).toHaveProperty('distractionLevel');
    expect(inferences).toHaveProperty('hourlyRisks');

    // Logic Check:
    // Based on the mock data (Slack Peak 11am, Jira Peak 2pm), the inference engine 
    // should detect some overlap and calculate a risk score.
    expect(inferences.contextSwitchingScore).toBeGreaterThan(0);
    
    // Check that hourly risks are calculated for every hour of the day
    expect(inferences.hourlyRisks).toHaveLength(24);
    
    console.log(`    > Inference Result: Peak Context Switching at Hour ${inferences.peakContextSwitchingHour} with Score ${inferences.contextSwitchingScore}`);
  });
});