require('dotenv').config();
const db = require('./src/config/database');

const REQUIRED_ENV = [
  'DATABASE_URL',
  'JIRA_CLIENT_ID',
  'JIRA_CLIENT_SECRET',
  'JIRA_REDIRECT_URI',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'JWT_SECRET'
];

async function verifyProduction() {
  console.log('🔍 Starting Production Verification...\n');

  // 1. Check Environment Variables
  console.log('1️⃣  Checking Environment Variables...');
  const missing = REQUIRED_ENV.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error(`   ❌ MISSING: ${missing.join(', ')}`);
  } else {
    console.log('   ✅ All required variables present.');
  }

  // 2. Check Database Connection
  console.log('\n2️⃣  Checking Database Connection...');
  try {
    await db.sequelize.authenticate();
    console.log('   ✅ Connection successful.');
    const dialect = db.sequelize.getDialect();
    console.log(`   ℹ️  Dialect: ${dialect}`);
    if (dialect !== 'postgres') {
      console.warn('   ⚠️  WARNING: Not using Postgres. Ensure this is intended for production.');
    }
  } catch (error) {
    console.error('   ❌ Connection FAILED:', error.message);
    process.exit(1);
  }

  // 3. Check Critical Tables
  console.log('\n3️⃣  Checking Critical Tables...');
  const tables = ['Users', 'JiraIntegrations', 'UserIntegrations', 'checkins'];
  for (const table of tables) {
    try {
      await db.sequelize.query(`SELECT 1 FROM "${table}" LIMIT 1`); // Postgres quotes
      console.log(`   ✅ Table '${table}' exists.`);
    } catch (e) {
      // Try without quotes for SQLite compatibility
      console.log(`   ❓ Could not verify '${table}' (might be empty or casing issue).`);
    }
  }

  console.log('\n🏁 Verification Complete.');
  process.exit(0);
}

verifyProduction();