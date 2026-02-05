const db = require('../config/database');
const JiraIntegration = require('../models/JiraIntegration');
const JiraIssue = require('../models/JiraIssue');

async function verify() {
  try {
    // Ensure DB connection
    await db.sequelize.authenticate();
    console.log('✅ Connected to database.');

    const userId = 3; // The user ID you are testing with

    // 1. Find Integration
    const integration = await JiraIntegration.findOne({ where: { userId } });
    
    if (!integration) {
      console.log(`❌ No Jira integration found for user ${userId}`);
      return;
    }

    console.log(`✅ Found integration for user ${userId} (Integration ID: ${integration.id})`);

    // 2. Count Issues
    const count = await JiraIssue.count({ where: { integrationId: integration.id } });
    console.log(`📊 Total Jira Issues stored: ${count}`);

    // 3. List Recent Issues
    const issues = await JiraIssue.findAll({
      where: { integrationId: integration.id },
      limit: 10,
      order: [['updatedAt', 'DESC']], // Show most recently updated/synced first
      attributes: ['issueKey', 'summary', 'status', 'storyPoints']
    });

    if (issues.length > 0) {
      console.log('\n📝 Recent Issues:');
      issues.forEach(issue => {
        console.log(`   - [${issue.issueKey}] ${issue.summary} (Status: ${issue.status}, Points: ${issue.storyPoints})`);
      });
    } else {
      console.log('   (No issues found in the table)');
    }

  } catch (err) {
    console.error('❌ Verification failed:', err);
  }
}

verify();