const db = require('../config/database');
const { hashPassword } = require('../utils/password');

async function seedDatabase() {
  try {
    const sequelize = db.sequelize;
    console.log('Connecting to database...');
    await sequelize.authenticate();

    // Ensure tables exist before seeding
    await sequelize.sync();

    console.log('Seeding data...');
    const commonPassword = await hashPassword('password123');
    const pilotPassword = await hashPassword('Pilot2026!');

    // 1. Create Test Employer
    const [employer] = await db.User.findOrCreate({
      where: { email: 'boss@test.com' },
      defaults: {
        name: 'Test Employer',
        password: commonPassword,
        role: 'employer',
        companyCode: 'TEST01'
      }
    });
    console.log(`✅ Employer created: ${employer.email} (Code: ${employer.companyCode})`);

    // 2. Create Test Employee
    const [employee] = await db.User.findOrCreate({
      where: { email: 'worker@test.com' },
      defaults: {
        name: 'Test Employee',
        password: commonPassword,
        role: 'employee',
        companyCode: 'TEST01'
      }
    });
    console.log(`✅ Employee created: ${employee.email}`);

    // 3. Create Pilot User (For your curl test)
    const [pilot] = await db.User.findOrCreate({
      where: { email: 'testcompany@gmail.com' },
      defaults: {
        name: 'Pilot Employer',
        password: pilotPassword,
        role: 'employer',
        companyCode: '10B196'
      }
    });
    console.log(`✅ Pilot User created: ${pilot.email}`);

    console.log('\nSeed successful! You can now login with these credentials.');
    process.exit(0);

  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    console.error('Details:', error);
    process.exit(1);
  }
}

seedDatabase().catch(e => console.error(e));