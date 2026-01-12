require('dotenv').config(); // Load .env file at the top
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

// --- Route Imports ---
const authRoutes = require('./routes/auth');
const checkinRoutes = require('./routes/checkins');
const predictRoutes = require('./routes/predict');
const reportRoutes = require('./routes/reports');
const simulatorRoutes = require('./routes/simulator');
const employerSimulatorRoutes = require('./routes/employerSimulator');
const { authenticateToken } = require('./middleware/authMiddleware');
const { hashPassword } = require('./utils/password');

// --- Database Initialization ---
async function initializeDatabase() {
  try {
    const db = require('./db/database');
    if (db && db.sequelize && typeof db.sequelize.authenticate === 'function') {
      await db.sequelize.authenticate();
      const host = db.sequelize.config?.host || db.sequelize.options?.host || 'unknown';
      console.log(`Database connection has been established successfully to: ${host}`);
      if (typeof db.sequelize.sync === 'function') {
        // Disable foreign keys temporarily to allow SQLite to handle table alterations
        const dialect = db.sequelize.getDialect();
        if (dialect === 'sqlite') {
          await db.sequelize.query('PRAGMA foreign_keys = OFF');
        }
        
        try {
          // Sync models with database
          await db.sequelize.sync({ alter: true });
        } catch (err) {
          // Only attempt rebuild if we are strictly in development using SQLite
          // This prevents production data loss on Supabase/Postgres
          if (dialect === 'sqlite' && process.env.NODE_ENV !== 'production') {
            console.log('⚠️ SQLite sync error detected (likely Checkins_backup). Rebuilding DB...');
            await db.sequelize.sync({ force: true });
          } else throw err;
        }

        // Ensure Users has teamId (Legacy check, handled by model definition now but kept for safety)
        try {
          await db.sequelize.query(`ALTER TABLE Users ADD COLUMN teamId INTEGER`);
        } catch (e) { /* ignore if exists */ }

        if (dialect === 'sqlite') {
          await db.sequelize.query('PRAGMA foreign_keys = OFF'); // Ensure FKs stay OFF for runtime
        }
        console.log('All models were synchronized successfully.');
      }
    } else if (typeof db === 'function') {
      db(); // Support for simple init function pattern
      console.log('Database initialized via function call.');
    }
    return db;
  } catch (error) {
    console.error('Unable to connect to the database:', error.message);
    if (error.errors) {
      console.error('Validation errors:', JSON.stringify(error.errors, null, 2));
    }
    process.exit(1); // Exit if the database is critical
  }
}

// --- Main Application Logic ---
async function main() {
  await initializeDatabase();

  const app = express();

  // --- Core Middleware ---
  app.set('trust proxy', 1); // Trust Nginx reverse proxy
  app.use(helmet({ hsts: false })); // Disable HSTS in Node, handled by Nginx
  app.use(cors());   // Enable Cross-Origin Resource Sharing
  app.use(express.json()); // Parse incoming JSON requests
  app.use(express.urlencoded({ extended: false })); // Parse URL-encoded bodies

  // --- Debugging: Log Incoming Requests ---
  app.use((req, res, next) => {
    console.log(`[API Request] ${req.method} ${req.originalUrl}`);
    next();
  });

  // --- API Routes ---
  app.get('/api', (req, res) => res.json({ ok: true, env: process.env.NODE_ENV || 'development' }));
  
  // Health Check Endpoint (Verifies DB Connection)
  app.get('/api/health', async (req, res) => {
    try {
      const db = require('./db/database');
      await db.sequelize.authenticate();
      const host = db.sequelize.config?.host || db.sequelize.options?.host || 'unknown';
      res.json({ status: 'ok', database: 'connected', dialect: db.sequelize.getDialect(), host });
    } catch (err) {
      res.status(500).json({ status: 'error', database: 'disconnected', error: err.message });
    }
  });

  // --- POPULATE DATA ENDPOINT (Magic Link - Temporary) ---
  app.get('/api/debug/populate', async (req, res) => {
    const { companyCode } = req.query;
    if (!companyCode) return res.status(400).json({ error: 'companyCode query param required' });
    
    const code = companyCode.toUpperCase();
    const db = require('./db/database');

    try {
      // 1. Create Team
      let team = await db.Team.findOne({ where: { companyCode: code } });
      if (!team) {
        team = await db.Team.create({ name: 'General Team', companyCode: code });
      }

      // 2. Create Employees
      const defaultPassword = await hashPassword('password123');
      const employees = [];
      
      for (let i = 1; i <= 30; i++) {
        const email = `emp${i}_${code.toLowerCase()}@example.com`;
        const [user] = await db.User.findOrCreate({
          where: { email },
          defaults: {
            name: `Employee ${i} (${code})`,
            password: defaultPassword,
            role: 'employee',
            companyCode: code,
            teamId: team.id
          }
        });
        if (user.teamId !== team.id) {
          user.teamId = team.id;
          await user.save();
        }
        employees.push(user);
      }

      // 3. Create Checkins
      const checkins = [];
      const now = new Date();
      for (let i = 0; i < 300; i++) {
        const randomEmployee = employees[Math.floor(Math.random() * employees.length)];
        const daysAgo = Math.floor(Math.random() * 90);
        const date = new Date(now);
        date.setDate(date.getDate() - daysAgo);
        
        checkins.push({
          userId: randomEmployee.id,
          stress: Math.floor(Math.random() * 10) + 1,
          sleep: Math.floor(Math.random() * 9) + 3,
          workload: Math.floor(Math.random() * 10) + 1,
          coffee: Math.floor(Math.random() * 6),
          createdAt: date,
          updatedAt: date
        });
      }
      await db.Checkin.bulkCreate(checkins);
      
      res.json({ success: true, message: `Added 30 employees and 300 checkins to ${code}` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/checkins', authenticateToken, checkinRoutes);
  app.use('/api/predict', authenticateToken, predictRoutes);
  app.use('/api/reports', authenticateToken, reportRoutes);
  app.use('/api/action-impact', authenticateToken, simulatorRoutes);
  app.use('/api/employer-simulator', authenticateToken, employerSimulatorRoutes);
  app.use('/api/teams', authenticateToken, require('./routes/teams'));
  app.use('/api/gamification', authenticateToken, require('./routes/gamification'));

  // --- Frontend Serving (for production) ---
  if (process.env.NODE_ENV === 'production') {
    // Serve the static files from the React app
    app.use(express.static(path.join(__dirname, '../frontend/dist')));

    // Handles any requests that don't match the ones above
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
    });
  }

  // --- Error Handling ---
  // 404 Not Found handler
  app.use((req, res, next) => {
    res.status(404).json({ error: 'Not Found' });
  });

  // Global error handler
  app.use((err, req, res, next) => {
    console.error(err.stack || err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  });

  // --- Server Start ---
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
  });
}

main().catch(error => {
  console.error("Failed to start the server:", error);
});