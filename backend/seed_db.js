const db = require('./db/database');
const { hashPassword } = require('./utils/password');

async function seedDatabase() {
  try {
    const sequelize = db.sequelize;
    console.log('Connecting to database...');
    await sequelize.authenticate();

    // 1. Check if data already exists to prevent duplicates
    const existingUser = await db.User.findOne({ where: { email: 'boss@test.com' } });
    if (existingUser) {
      console.log('Database already seeded. Skipping.');
      process.exit(0);
    }

    console.log('Seeding data...');
    const commonPassword = await hashPassword('password123');

    // 2. Create Test Employer
    const employer = await db.User.create({
      name: 'Test Employer',
      email: 'boss@test.com',
      password: commonPassword,
      role: 'employer',
      companyCode: 'TEST01' // Fixed code for testing
    });
    console.log(`✅ Employer created: ${employer.email} (Code: ${employer.companyCode})`);

    // 3. Create Test Employee
    const employee = await db.User.create({
      name: 'Test Employee',
      email: 'worker@test.com',
      password: commonPassword,
      role: 'employee',
      companyCode: 'TEST01'
    });
    console.log(`✅ Employee created: ${employee.email}`);

    console.log('\nSeed successful! You can now login with these credentials.');
    process.exit(0);

  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    console.error('Details:', error);
    process.exit(1);
  }
}

seedDatabase();