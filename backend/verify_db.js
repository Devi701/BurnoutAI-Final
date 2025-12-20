const db = require('./db/database');

async function verifyDatabase() {
  const sequelize = db.sequelize;

  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('Connection successful.\n');

    // 1. Get all table names from SQLite master record
    const [tables] = await sequelize.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );

    if (!tables || tables.length === 0) {
      console.log('No tables found in the database.');
      return;
    }

    console.log(`Found ${tables.length} tables. Listing schema:\n`);

    // 2. Loop through each table and get column details
    for (const table of tables) {
      const tableName = table.name;
      console.log(`=== Table: ${tableName} ===`);
      
      const [columns] = await sequelize.query(`PRAGMA table_info('${tableName}')`);
      
      // Format for console.table
      const schema = columns.map(col => ({
        Column: col.name,
        Type: col.type,
        Nullable: col.notnull ? 'NO' : 'YES',
        PK: col.pk ? 'YES' : 'NO',
        Default: col.dflt_value
      }));

      console.table(schema);
      console.log('\n');
    }

  } catch (error) {
    console.error('Error verifying database:', error);
  } finally {
    process.exit(0);
  }
}

verifyDatabase();