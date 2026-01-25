const db = require('./db/database');

// --- CONFIGURATION ---
const TARGET_EMAIL = 'test1@gmail.com'; // <--- CHANGE THIS to the email you are logged in with
const DAYS_TO_GENERATE = 30;
const DELAY_SECONDS = 15; // Time to look at the graph before deletion

async function run() {
  try {
    console.log('Connecting to database...');
    await db.sequelize.authenticate();
    
    // 1. Find User
    const user = await db.User.findOne({ where: { email: TARGET_EMAIL } });
    if (!user) {
      console.error(`❌ User with email "${TARGET_EMAIL}" not found.`);
      console.error('Please edit the TARGET_EMAIL in backend/test_graph.js to match your login email.');
      process.exit(1);
    }
    
    console.log(`Found user: ${user.email} (ID: ${user.id})`);

    // 2. Generate Data
    console.log(`Generating ${DAYS_TO_GENERATE} days of check-in data...`);
    const checkins = [];
    const now = new Date();

    for (let i = DAYS_TO_GENERATE; i > 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      
      // Create a sine wave pattern for stress so the graph looks interesting
      const stress = 5 + Math.sin(i * 0.5) * 3 + (Math.random() * 1); 
      
      checkins.push({
        userId: user.id,
        stress: Math.max(1, Math.min(10, stress)), // Clamp 1-10
        sleep: 6 + Math.random() * 3, // 6-9 hours
        workload: 4 + Math.random() * 4, // 4-8
        coffee: Math.floor(Math.random() * 3),
        createdAt: date,
        updatedAt: date
      });
    }

    // 3. Insert Data
    await db.Checkin.bulkCreate(checkins);
    console.log('✅ Data populated successfully!');
    console.log('------------------------------------------------');
    console.log(`👉 GO CHECK YOUR DASHBOARD NOW! (You have ${DELAY_SECONDS} seconds)`);
    console.log('------------------------------------------------');

    // 4. Countdown
    let secondsLeft = DELAY_SECONDS;
    const interval = setInterval(() => {
      secondsLeft--;
      process.stdout.write(`\rDeleting data in ${secondsLeft} seconds... `);
      if (secondsLeft <= 0) {
        clearInterval(interval);
        process.stdout.write('\n');
      }
    }, 1000);

    await new Promise(resolve => setTimeout(resolve, DELAY_SECONDS * 1000));

    // 5. Cleanup
    console.log('Cleaning up...');
    await db.Checkin.destroy({ 
      where: { userId: user.id } 
    });
    
    // Also clear quiz results if any, to reset baseline
    if (db.QuizResult) {
        await db.QuizResult.destroy({ where: { userId: user.id } });
    }

    console.log('✅ History cleared.');
    process.exit(0);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

try { await run(); } catch (e) { console.error(e); }