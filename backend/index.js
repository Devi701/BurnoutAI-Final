require('dotenv').config(); // Load .env file at the top
const dns = require('node:dns');

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

// --- Database Initialization ---
async function initializeDatabase() {
  try {
    const db = require('./db/database');
    if (db && db.sequelize && typeof db.sequelize.authenticate === 'function') {
      await db.sequelize.authenticate();
      const host = db.sequelize.config?.host ?? db.sequelize.options?.host ?? 'unknown';
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
  const whitelist = new Set([
    (process.env.FRONTEND_URL || '').trim(), // Best practice: Use an env var for the frontend URL
    'https://www.razoncomfort.com',
    'https://razoncomfort.com',
    'https://burnout-ai-final.vercel.app',
    'http://localhost:5173' // For local development
  ].filter(Boolean)); // Remove undefined values to prevent errors

  const corsOptions = {
    origin: (origin, callback) => {
      // Allow if not in production, if there's no origin (e.g. curl), or if origin is in whitelist
      if (
        process.env.NODE_ENV !== 'production' || 
        !origin || 
        whitelist.has(origin)
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
  app.get('/', (req, res) => {
    const baseUrl = process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`;
    const magicLink = `${baseUrl}/api/auth/magic-link?key=burnout_pilot_2026`;
    
    // Log to console so it appears in Render logs immediately
    console.log('🔑 MAGIC LINK REQUESTED:', magicLink);

    // Return HTML for browsers, JSON for API clients
    if (req.accepts('html')) {
      res.send(`
        <div style="font-family:sans-serif;text-align:center;padding:50px;">
          <h1>Backend Online 🟢</h1>
          <a href="${magicLink}" style="background:#2563eb;color:white;padding:15px 30px;text-decoration:none;border-radius:5px;font-size:18px;">Login to Pilot</a>
          <p style="margin-top:20px;color:#666;font-size:12px;">${magicLink}</p>
        </div>
      `);
    } else {
      res.json({ status: 'online', magic_link: magicLink });
    }
  });
  app.get('/api', (req, res) => res.json({ ok: true })); // Removed env leak
  
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
    
    // Print Magic Link to logs for easy access
    const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    console.log('-------------------------------------------------------');
    console.log('🔑 PILOT MAGIC LINK:');
    console.log(`${baseUrl}/api/auth/magic-link?key=burnout_pilot_2026`);
    console.log('-------------------------------------------------------');
  });
}

try {
  await main();
} catch (error) {
  console.error("Failed to start the server:", error);
}