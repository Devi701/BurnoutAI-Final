const db = require('../config/database');

(async () => {
try {
  const sequelize = db.sequelize;
  
  console.log('Syncing database models...');
  // Safe sync: Creates tables if they don't exist, does NOT alter existing ones.
  await sequelize.sync();
  console.log('✅ Database tables created successfully.');

  process.exit(0);
} catch (err) {
  console.error('create_tables error:', err?.message ?? err);
  process.exit(1);
}
})();