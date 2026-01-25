const db = require('./db/database');

async function verifyGamificationModels() {
  const sequelize = db.sequelize;

  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('Connection successful.\n');

    const gamificationTables = [
      'UserStats',
      'Badges',
      'UserBadges',
      'Referrals',
      'Challenges',
      'UserChallenges'
    ];

    console.log('Verifying Gamification Tables:\n');

    for (const tableName of gamificationTables) {
      console.log(`Checking table: ${tableName}...`);
      
      // Check if table exists
      const [results] = await sequelize.query(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`
      );

      if (results.length === 0) {
        console.error(`❌ Table '${tableName}' does NOT exist.`);
        continue;
      }

      console.log(`✅ Table '${tableName}' exists.`);

      // List columns
      const [columns] = await sequelize.query(`PRAGMA table_info('${tableName}')`);
      console.log('   Columns:');
      columns.forEach(col => {
        console.log(`     - ${col.name} (${col.type})`);
      });
      console.log('\n');
    }

  } catch (error) {
    console.error('Error verifying database:', error);
  } finally {
    process.exit(0);
  }
}

try { await verifyGamificationModels(); } catch (e) { console.error(e); }