require('dotenv').config();
const db = require('./db/database');

try {
  console.log('------------------------------------------------');
  console.log('🚀 Starting Database Migration...');
  console.log('------------------------------------------------');

  
    await db.sequelize.authenticate();
    console.log('✅ Connected to Database.');

    // Sync models to database (creates tables if missing)
    await db.sequelize.sync({ alter: true });
    
    console.log('✅ Migration successful! All tables have been created/updated.');

} catch (error) {
  console.error('❌ Migration failed:', error.message);
} finally {
  console.log('------------------------------------------------');
  process.exit();
}