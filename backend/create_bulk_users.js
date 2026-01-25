const db = require('./db/database');
const { hashPassword } = require('./utils/password');

const COMPANY_CODE = process.argv[2] || '7B08C8';
const NUM_USERS = 30;
const CHECKINS_PER_USER = 10;

try {
  try {
    console.log(`Connecting to database...`);
    await db.sequelize.authenticate();

    const password = await hashPassword('password123');
    const users = [];

    console.log(`Generating ${NUM_USERS} users for company ${COMPANY_CODE}...`);

    for (let i = 1; i <= NUM_USERS; i++) {
      users.push({
        name: `Employee ${i}`,
        email: `user${i}.${COMPANY_CODE.toLowerCase()}@example.com`,
        password: password,
        role: 'employee',
        companyCode: COMPANY_CODE,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    // Use ignoreDuplicates to avoid crashing if users already exist
    await db.User.bulkCreate(users, { ignoreDuplicates: true });
    console.log(`✅ Users processed (created or skipped if existing).`);

    // Fetch users from DB to ensure we have IDs (bulkCreate with ignore doesn't always return them)
    const targetUsers = await db.User.findAll({ where: { companyCode: COMPANY_CODE, role: 'employee' } });

    console.log(`Generating ${CHECKINS_PER_USER} check-ins for each user...`);
    const checkins = [];
    const now = new Date();

    for (const user of targetUsers) {
      const userId = user.id;

      for (let d = 0; d < CHECKINS_PER_USER; d++) {
        const date = new Date(now);
        date.setDate(date.getDate() - (CHECKINS_PER_USER - d));

        checkins.push({
          userId: userId,
          companyCode: COMPANY_CODE,
          stress: Math.floor(Math.random() * 10) + 1,
          sleep: Number.parseFloat((Math.random() * 5 + 4).toFixed(1)),
          workload: Math.floor(Math.random() * 10) + 1,
          coffee: Math.floor(Math.random() * 5),
          note: 'Auto-generated check-in',
          createdAt: date,
          updatedAt: date
        });
      }
    }

    await db.Checkin.bulkCreate(checkins);
    console.log(`✅ Created ${checkins.length} check-ins successfully.`);

    console.log(`   Emails: user1.${COMPANY_CODE.toLowerCase()}@example.com ... user30.${COMPANY_CODE.toLowerCase()}@example.com`);
    console.log(`   Password: password123`);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
} catch (error) {
  console.error('Top-level error:', error);
}