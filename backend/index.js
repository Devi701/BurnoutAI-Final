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
const rateLimit = require('express-rate-limit');

// --- Route Imports ---
const authRoutes = require('./src/routes/auth');
const checkinRoutes = require('./src/routes/checkins');
const predictRoutes = require('./src/routes/predict');
const reportRoutes = require('./src/routes/reports');
const simulatorRoutes = require('./src/routes/simulator');
const employerSimulatorRoutes = require('./src/routes/employerSimulator');
const { authenticateToken } = require('./src/middleware/authMiddleware');
const integrationsRoutes = require('./src/routes/integrations.routes');
const jiraRoutes = require('./src/routes/jira_integration');
const googleRoutes = require('./src/routes/google_integration');
const slackRoutes = require('./src/routes/slack_integration');
const trelloRoutes = require('./src/routes/trello_integration');
const { startNightlySync } = require('./src/jobs/nightlySync.job');
const { getSystemHealth } = require('./src/utils/cacheMonitor');


// --- Database Initialization ---
async function initializeDatabase() {
  try {
    const db = require('./src/config/database');
    if (db && db.sequelize && typeof db.sequelize.authenticate === 'function') {
      await db.sequelize.authenticate();
      // SQLite ALTER is fragile with composite unique indexes (can incorrectly add UNIQUE per-column).
      // Avoid ALTER on SQLite to prevent startup failures; use migrations/scripts if needed.
      const dialect = db.sequelize.getDialect();
      await db.sequelize.sync({ alter: dialect !== 'sqlite' }); // Syncs DB schema with Models
      console.log('✅ Database schema synced successfully.');
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
  app.use(helmet({ 
    // Enable HSTS in production to enforce HTTPS
    hsts: process.env.NODE_ENV === 'production' 
  }));

  // --- CORS Configuration for Production Security ---
  const whitelist = new Set([
    (process.env.FRONTEND_URL || '').trim(), // Best practice: Use an env var for the frontend URL
    'https://www.razoncomfort.com',
    'https://razoncomfort.com',
    'https://burnout-ai-final.vercel.app',
    'http://localhost:5173', // For local development
    'https://burnoutai-final.onrender.com', // Your Render Backend/Frontend
    'https://burnoutai-final.onerender.com',
    'https://burnout-ai-final-git-main-devi701s-projects.vercel.app',
    'https://burnout-ai-final-612mq0h65-devi701s-projects.vercel.app'
  ].filter(Boolean)); // Remove undefined values to prevent errors

  // Dynamically allow the Slack Redirect URI origin (e.g., your ngrok URL)
  if (process.env.SLACK_REDIRECT_URI) {
    try {
      const slackUrl = new URL(process.env.SLACK_REDIRECT_URI);
      whitelist.add(slackUrl.origin);
      console.log(`[CORS] Added allowed origin from SLACK_REDIRECT_URI: ${slackUrl.origin}`);
    } catch (e) {
      console.warn('[CORS] Invalid SLACK_REDIRECT_URI in env, could not add to whitelist.');
    }
  }

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

  // --- Debugging: Log Incoming Requests (opt-in in production) ---
  const enableRequestLogs = process.env.ENABLE_REQUEST_LOGS === 'true' || process.env.NODE_ENV !== 'production';
  if (enableRequestLogs) {
    app.use((req, res, next) => {
      console.log(`[API Request] ${req.method} ${req.originalUrl}`);
      next();
    });
  }

  // --- Global Rate Limiting ---
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: Number(process.env.GLOBAL_RATE_LIMIT_MAX || 20000),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
  });
  app.use('/api/', globalLimiter);

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
      const db = require('./src/config/database');
      await db.sequelize.authenticate();
      const host = db.sequelize.config?.host || db.sequelize.options?.host || 'unknown';
      res.json({ status: 'ok', database: 'connected', dialect: db.sequelize.getDialect(), host });
    } catch (err) {
      res.status(500).json({ status: 'error', database: 'disconnected', error: err.message });
    }
  });

  // --- Monitoring Endpoint ---
  app.get('/api/system/health', (req, res) => {
    res.json(getSystemHealth());
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/checkins', authenticateToken, checkinRoutes);
  app.use('/api/predict', authenticateToken, predictRoutes);
  app.use('/api/reports', authenticateToken, reportRoutes);
  app.use('/api/action-impact', authenticateToken, simulatorRoutes);
  app.use('/api/employer-simulator', authenticateToken, employerSimulatorRoutes);
  app.use('/api/teams', authenticateToken, require('./src/routes/teams'));
  app.use('/api/gamification', authenticateToken, require('./src/routes/gamification'));
  app.use('/api/surveys', authenticateToken, require('./src/routes/surveys'));
  app.use('/api/integrations', integrationsRoutes);
  app.use('/api/integrations/jira', jiraRoutes);
  app.use('/api/integrations/google', googleRoutes);
  app.use('/api/integrations/slack', slackRoutes);
  // Trello routes are already imported as trelloRoutes at top, just ensuring usage
  app.use('/api/integrations/trello', trelloRoutes);

  // --- Background Jobs ---
  startNightlySync();

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
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
    
    // Print Magic Link to logs for easy access
    const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    console.log('-------------------------------------------------------');
    console.log('🔑 PILOT MAGIC LINK:');
    console.log(`${baseUrl}/api/auth/magic-link?key=burnout_pilot_2026`);
    console.log('-------------------------------------------------------');

    if (process.env.SLACK_REDIRECT_URI) {
      console.log(`ℹ️  Slack Redirect URI: ${process.env.SLACK_REDIRECT_URI}`);
    }
  });

  // Bound max latency tails and avoid hanging sockets under load.
  server.requestTimeout = Number(process.env.SERVER_REQUEST_TIMEOUT_MS || 6000);
  server.headersTimeout = Number(process.env.SERVER_HEADERS_TIMEOUT_MS || 6500);
  server.keepAliveTimeout = Number(process.env.SERVER_KEEPALIVE_TIMEOUT_MS || 5000);
  server.timeout = Number(process.env.SERVER_SOCKET_TIMEOUT_MS || 7000);
}

main().catch(error => {
  console.error("Failed to start the server:", error);
});
