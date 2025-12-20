const db = require('./db/database');

async function main() {
  const sequelize = db.sequelize;
  
  // Skip manual table creation for PostgreSQL (Sequelize sync in index.js handles it)
  if (sequelize.getDialect() === 'postgres') {
    console.log('PostgreSQL detected. Skipping manual SQLite table creation script.');
    process.exit(0);
  }

  // ensure table exists
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      companyCode TEXT,
      stress REAL,
      sleep REAL,
      workload REAL,
      coffee REAL,
      date TEXT DEFAULT (date('now'))
    );
  `);

  // Manually fix Users table by adding missing columns required by auth.js
  const columnsToAdd = [
    { name: 'name', type: 'TEXT' },
    { name: 'email', type: 'TEXT' },
    { name: 'password', type: 'TEXT' },
    { name: 'role', type: 'TEXT' },
    { name: 'companyCode', type: 'TEXT' },
    { name: 'resetPasswordToken', type: 'TEXT' },
    { name: 'resetPasswordExpires', type: 'INTEGER' },
    { name: 'createdAt', type: 'DATETIME' },
    { name: 'updatedAt', type: 'DATETIME' }
  ];

  for (const col of columnsToAdd) {
    try {
      await sequelize.query(`ALTER TABLE Users ADD COLUMN ${col.name} ${col.type}`);
      console.log(`Successfully added '${col.name}' column to Users table.`);
    } catch (err) {
      console.log(`Note: Could not add '${col.name}' column (it might already exist).`);
    }
  }

  // Manually fix checkins table by adding missing columns
  const checkinColumnsToAdd = [
    { name: 'userId', type: 'INTEGER' },
    { name: 'companyCode', type: 'TEXT' },
    { name: 'stress', type: 'REAL' },
    { name: 'sleep', type: 'REAL' },
    { name: 'workload', type: 'REAL' },
    { name: 'coffee', type: 'REAL' },
    { name: 'createdAt', type: 'DATETIME' },
    { name: 'updatedAt', type: 'DATETIME' },
    { name: 'note', type: 'TEXT' }
  ];

  for (const col of checkinColumnsToAdd) {
    try {
      await sequelize.query(`ALTER TABLE checkins ADD COLUMN ${col.name} ${col.type}`);
      console.log(`Successfully added '${col.name}' column to checkins table.`);
    } catch (err) {
      console.log(`Note: Could not add '${col.name}' column (it might already exist).`);
    }
  }

  // Attempt to migrate data from old user_id column if it exists and userId is empty
  try {
    const [columns] = await sequelize.query("PRAGMA table_info(checkins)");
    const colNames = columns.map(c => c.name);

    if (colNames.includes('user_id') && colNames.includes('userId')) {
       await sequelize.query("UPDATE checkins SET userId = user_id WHERE userId IS NULL");
       console.log("Migrated data from user_id to userId.");
    }
  } catch (err) {
    console.log("Migration step skipped or failed: " + err.message);
  }

  // OPTIONAL: set company_code for existing rows that are NULL (uncomment if desired)
  // await sequelize.query("UPDATE checkins SET company_code = ? WHERE company_code IS NULL", { replacements: ['ACME'] });

  // Verify Users table schema
  try {
    const [results] = await sequelize.query("PRAGMA table_info(Users)");
    console.log("Current Users table columns:", results.map(c => c.name).join(', '));
    
    const [cResults] = await sequelize.query("PRAGMA table_info(checkins)");
    console.log("Current Checkins table columns:", cResults.map(c => c.name).join(', '));
  } catch (e) {
    console.log("Could not verify Users table.");
  }

  // print distinct user count for ACME (change code if needed)
  try {
    const [rows] = await sequelize.query(
      "SELECT COUNT(DISTINCT userId) AS cnt FROM checkins WHERE companyCode = ?",
      { replacements: ['ACME'] }
    );
    const cnt = rows && rows[0] ? Number(rows[0].cnt || 0) : 0;
    console.log('distinct users with checkins for ACME:', cnt);
  } catch (err) {
    console.log('Note: Could not query checkins count (schema might vary slightly). Ignoring.');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('create_tables error:', err && err.message ? err.message : err);
  process.exit(1);
});