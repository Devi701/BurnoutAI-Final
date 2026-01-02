/**
 * SCRIPT TO AUTO-GENERATE POSTHOG DASHBOARD (DIAGNOSTIC VERSION)
 */
const axios = require('axios');

// --- CONFIGURATION ---
const PROJECT_ID = '109705'; 
// Ensure this key has "Project" scope with "Write" permission
const PERSONAL_API_KEY = 'phx_3bKZPhGsOY64EXCZQ17SjWLJnHyjTRyWfG9PApfuydR6DKT'; 

const API_BASE = `https://eu.posthog.com/api/projects/${PROJECT_ID}`;
// Use trim() to remove accidental whitespace from copy-pasting
const HEADERS = { headers: { Authorization: `Bearer ${PERSONAL_API_KEY.trim()}` } };

async function createDashboard() {
  console.log('🔍 Initializing Dashboard Creation...');

  // 1. Verify Connection first
  try {
    // FIXED: Use eu.posthog.com instead of app.posthog.com
    await axios.get(`https://eu.posthog.com/api/users/@me/`, HEADERS);
    console.log('✅ API Key is valid.');
  } catch (error) {
    console.error('❌ API Key Invalid. Please generate a new Personal API Key with "Project" + "Write" scopes.');
    console.error(`   Server responded: ${error.response?.status} ${error.response?.statusText}`);
    return;
  }

  try {
    // 2. Create the Dashboard container
    const dashRes = await axios.post(`${API_BASE}/dashboards/`, {
      name: 'Burnout MVP Pilot Stats',
      description: 'Key metrics for the Burnout MVP pilot.',
    }, HEADERS);
    
    const dashboardId = dashRes.data.id;
    console.log(`✅ Dashboard created with ID: ${dashboardId}`);

    // 3. Define the Insights (Charts)
    const insights = [
      {
        name: 'Onboarding Completion Funnel',
        filters: {
          insight: 'FUNNELS',
          events: [
            { id: 'user_signed_up', order: 0, name: 'Signed Up' },
            { id: 'first_checkin_completed', order: 1, name: 'First Check-in' }
          ],
          display: 'FunnelViz',
        }
      },
      {
        name: 'Daily Active Users (Check-ins)',
        filters: {
          events: [{ id: 'daily_checkin_completed', math: 'dau', name: 'Unique Users' }],
          display: 'ActionsLineGraph',
          interval: 'day'
        }
      },
      {
        name: 'Burnout Score Trend',
        filters: {
          events: [{ id: 'burnout_score_viewed', math: 'avg', math_property: 'current_score' }],
          display: 'ActionsLineGraph',
          interval: 'day'
        }
      },
      {
        name: 'Streak Reached (Users)',
        description: 'Users maintaining daily streaks',
        filters: { events: [{ id: 'streak_reached', math: 'total' }], display: 'ActionsBar' }
      },
      {
        name: 'Pilot Survey Funnel',
        filters: {
          insight: 'FUNNELS',
          events: [
            { id: 'pilot_survey_viewed', order: 0, name: 'Viewed' },
            { id: 'pilot_survey_submitted', order: 1, name: 'Submitted' }
          ],
          display: 'FunnelViz',
        }
      },
      {
        name: 'Feedback Sentiment',
        filters: {
          events: [{ id: 'pilot_survey_submitted', math: 'total' }],
          breakdown: 'clarityScore', // Using clarity score as proxy for sentiment
          display: 'Pie',
        }
      },
      {
        name: 'Feature Usage Breakdown',
        filters: {
          events: [
            { id: 'daily_checkin_completed', math: 'total', name: 'Check-ins' },
            { id: 'simulator_run', math: 'total', name: 'Simulations' },
            { id: 'history_viewed', math: 'total', name: 'History Views' },
            { id: 'action_plan_saved', math: 'total', name: 'Plans Saved' }
          ],
          display: 'ActionsBar',
        }
      }
    ];

    // 4. Create each insight
    for (const insight of insights) {
      process.stdout.write(`   Creating "${insight.name}"... `);
      await axios.post(`${API_BASE}/insights/`, {
        ...insight,
        dashboard: dashboardId
      }, HEADERS);
      console.log('Done.');
    }

    console.log(`\n🎉 Success! Access your new dashboard here:`);
    // FIXED: Also use eu.posthog.com for the dashboard link
    console.log(`https://eu.posthog.com/dashboard/${dashboardId}`);

  } catch (error) {
    console.error('\n❌ Error creating dashboard resources:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

createDashboard();