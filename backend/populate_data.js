require('dotenv').config();
const db = require('./db/database');
const { hashPassword } = require('./utils/password');

async function populateData() {
  // Get company code from terminal argument
  const rawCompanyCode = process.argv[2];

  if (!rawCompanyCode) {
    console.error('❌ Error: Please provide a company code.');
    console.log('Usage: node populate_data.js <COMPANY_CODE>');
    process.exit(1);
  }
  const companyCode = rawCompanyCode.toUpperCase();

  try {
    console.log(`Connecting to database...`);
    await db.sequelize.authenticate();
    const host = db.sequelize.config?.host || db.sequelize.options?.host || 'unknown';
    console.log(`Connected to database host: ${host}`);
    await db.sequelize.sync();

    console.log(`🚀 Generating data for Company Code: ${companyCode}`);

    // 1. Create/Get a Team (so employees show up in team views)
    let teamId = null;
    try {
      // Use Sequelize Model methods to handle quoting/dialects automatically
      let team = await db.Team.findOne({ where: { companyCode } });
      
      if (!team) {
        team = await db.Team.create({
          name: 'General Team',
          companyCode
        });
        console.log(`Created 'General Team' (ID: ${team.id})`);
      }
      teamId = team.id;
    } catch (e) { console.log('⚠️ Could not create/assign team:', e.message); }

    // 2. Create 30 Employees
    const employees = [];
    // Create a hashed password once to reuse (optimization)
    const defaultPassword = await hashPassword('password123');

    console.log('Creating 30 employees...');
    for (let i = 1; i <= 30; i++) {
      // Unique email based on company code to avoid collisions
      const email = `emp${i}_${companyCode.toLowerCase()}@example.com`;
      
      const [user] = await db.User.findOrCreate({
        where: { email },
        defaults: {
          name: `Employee ${i} (${companyCode})`,
          password: defaultPassword,
          role: 'employee',
          companyCode,
          teamId: teamId
        }
      });
      
      // If user existed but wasn't in the team, update them
      if (teamId && user.teamId !== teamId) {
        user.teamId = teamId;
        await user.save();
      }
      
      employees.push(user);
    }

    // 3. Create 300 Check-ins
    console.log('Creating 300 check-ins...');
    const checkins = [];
    const now = new Date();

    for (let i = 0; i < 300; i++) {
      // Pick a random employee from the newly created list
      const randomEmployee = employees[Math.floor(Math.random() * employees.length)];
      
      // Random date within the last 90 days
      const daysAgo = Math.floor(Math.random() * 90);
      const checkinDate = new Date(now);
      checkinDate.setDate(checkinDate.getDate() - daysAgo);

      checkins.push({
        userId: randomEmployee.id,
        stress: Math.floor(Math.random() * 10) + 1,   // 1-10
        sleep: Math.floor(Math.random() * 9) + 3,     // 3-12 hours
        workload: Math.floor(Math.random() * 10) + 1, // 1-10
        coffee: Math.floor(Math.random() * 6),        // 0-5 cups
        createdAt: checkinDate,
        updatedAt: checkinDate
      });
    }

    await db.Checkin.bulkCreate(checkins);

    // 4. Verify Data
    const userCount = await db.User.count({ where: { companyCode } });
    const checkinCount = await db.Checkin.count({ 
      include: [{ model: db.User, where: { companyCode } }] 
    }).catch(() => checkins.length); // Fallback if association fails

    console.log(`✅ Success! Added 30 employees and 300 check-ins to ${companyCode}.`);
    console.log(`   📊 Verification: Found ${userCount} employees in DB for this company.`);
    if (teamId) console.log(`   👥 Employees assigned to Team ID: ${teamId}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error populating data:', error);
    process.exit(1);
  }
}

populateData();