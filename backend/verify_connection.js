require('dotenv').config();
const db = require('./db/database');

try {
  console.log('------------------------------------------------');
  console.log('🔍 Verifying Database Connection...');
  console.log('------------------------------------------------');

  
    // 1. Test Connection
    await db.sequelize.authenticate();
    console.log('✅ Database connection established successfully.');
    
    // 2. Check Dialect (Confirm it's Postgres/Supabase)
    const dialect = db.sequelize.getDialect();
    console.log(`ℹ️  Dialect: ${dialect}`);

    if (dialect === 'postgres') {
      console.log('🌍 Connected to remote Postgres (Supabase)');
      
      // 3. Check Data (Optional)
      try {
        const userCount = await db.User.count();
        console.log(`👥 Users in DB: ${userCount}`);
      } catch (err) {
        if (err.original?.code === '42P01') { // Postgres code for undefined table
          console.log('⚠️  Tables not found. You need to run the migration script.');
        } else throw err;
      }
    } else {
      console.log('⚠️  Connected to local SQLite (Check your .env file if this is unexpected)');
    }

  } catch (error) {
    console.error('❌ Unable to connect to the database:', error.message);
  } finally {
    console.log('------------------------------------------------');
    process.exit();
  }