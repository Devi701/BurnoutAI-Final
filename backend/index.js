require('dotenv').config(); // Load .env file at the top
const dns = require('dns');

// Fix: Force IPv4 to avoid ENETUNREACH errors on Render (IPv6 connection issues)
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

// Aggressive Fix: Monkey-patch dns.lookup to ensure IPv4 is used.
const originalLookup = dns.lookup;
dns.lookup = (hostname, options, callback) => {
  if (typeof options === 'function') return originalLookup(hostname, { family: 4 }, options);
  return originalLookup(hostname, { ...options, family: 4 }, callback);
};

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

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

  // --- CORS Configuration for Production Security ---
  const whitelist = [
    process.env.FRONTEND_URL, // Best practice: Use an env var for the frontend URL
    'http://localhost:5173' // For local development
  ].filter(Boolean); // Remove undefined values to prevent errors

  const corsOptions = {
    origin: (origin, callback) => {
      // Allow if not in production, if there's no origin (e.g. curl), or if origin is in whitelist
      if (
        process.env.NODE_ENV !== 'production' || 
        !origin || 
        whitelist.includes(origin) ||
        origin.endsWith('.vercel.app') // Allow dynamic Vercel preview URLs
      ) {
        callback(null, true);
      } else {
        console.log(`[CORS] Blocked request from origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    }
  };
  app.use(cors(corsOptions));
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

  // --- SECURE POPULATE ENDPOINT ---
  app.post('/api/admin/populate', async (req, res) => {
    const apiKey = req.headers['x-populate-key'] || req.body.key;
    
    // 1. Security Check
    if (!process.env.POPULATE_KEY) {
      console.error('❌ POPULATE_KEY not set in environment.');
      return res.status(500).json({ error: 'Server configuration error: POPULATE_KEY missing.' });
    }
    
    if (apiKey !== process.env.POPULATE_KEY) {
      console.warn('⚠️ Unauthorized population attempt.');
      return res.status(403).json({ error: 'Forbidden: Invalid or missing API Key.' });
    }

    const db = require('./db/database');
    const { DataTypes } = require('sequelize');
    const COMPANY_CODE = '10B196';

    try {
      console.log(`🚀 Starting secure population for ${COMPANY_CODE}...`);

      // 2. Create Team
      let team = await db.Team.findOne({ where: { companyCode: COMPANY_CODE } });
      if (!team) {
        team = await db.Team.create({ name: 'General Team', companyCode: COMPANY_CODE });
      }

      // 3. Create 30 Employees
      const defaultPassword = await hashPassword('password123');
      const employees = [];
      
      for (let i = 1; i <= 30; i++) {
        const email = `emp${i}_${COMPANY_CODE.toLowerCase()}@example.com`;
        const [user] = await db.User.findOrCreate({
          where: { email },
          defaults: {
            name: `Employee ${i}`,
            password: defaultPassword,
            role: 'employee',
            companyCode: COMPANY_CODE,
            teamId: team.id
          }
        });
        employees.push(user);
      }

      // 4. Create 300 Checkins (Randomly distributed)
      const checkins = [];
      const now = new Date();
      
      for (let i = 0; i < 300; i++) {
        const randomEmp = employees[Math.floor(Math.random() * employees.length)];
        const daysAgo = Math.floor(Math.random() * 90);
        const date = new Date(now);
        date.setDate(date.getDate() - daysAgo);

        checkins.push({
          userId: randomEmp.id,
          stress: Math.floor(Math.random() * 10) + 1,
          sleep: Math.floor(Math.random() * 9) + 3,
          workload: Math.floor(Math.random() * 10) + 1,
          coffee: Math.floor(Math.random() * 6),
          companyCode: COMPANY_CODE,
          createdAt: date,
          updatedAt: date
        });
      }
      await db.Checkin.bulkCreate(checkins);

      // 5. Create 30 Action Plans per Employee
      const ActionPlan = db.sequelize.models.ActionPlan || db.sequelize.define('ActionPlan', {
        userId: { type: DataTypes.INTEGER, allowNull: false },
        actions: { type: DataTypes.JSON, allowNull: false },
        baselineScore: { type: DataTypes.INTEGER },
        projectedScore: { type: DataTypes.INTEGER },
        changePercent: { type: DataTypes.INTEGER },
        trend: { type: DataTypes.JSON },
      });

      const SIM_ACTION_TYPES = [
        { id: 'vacation_days', max: 14 },
        { id: 'sleep_hours', max: 12 },
        { id: 'workload_reduction', max: 50 },
        { id: 'boundary_hour', max: 22 },
        { id: 'movement_sessions', max: 7 },
        { id: 'social_minutes', max: 120 }
      ];

      const plans = [];
      for (const emp of employees) {
        for (let j = 0; j < 30; j++) {
          const typeDef = SIM_ACTION_TYPES[Math.floor(Math.random() * SIM_ACTION_TYPES.length)];
          const actionItem = {
            actionType: typeDef.id,
            intensity: Math.floor(Math.random() * typeDef.max) + 1,
            adhered: true
          };

          plans.push({
            userId: emp.id,
            actions: [actionItem],
            baselineScore: 50,
            projectedScore: 60,
            changePercent: 20,
            trend: [],
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }
      await ActionPlan.bulkCreate(plans);

      const summary = `Successfully created 30 employees, 300 checkins, and ${plans.length} action plans for company ${COMPANY_CODE}.`;
      console.log(`✅ ${summary}`);
      res.json({ success: true, message: summary });

    } catch (err) {
      console.error('❌ Population Error:', err);
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