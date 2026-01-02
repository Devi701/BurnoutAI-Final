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

// --- Database Initialization ---
async function initializeDatabase() {
  try {
    const db = require('./db/database');
    if (db && db.sequelize && typeof db.sequelize.authenticate === 'function') {
      await db.sequelize.authenticate();
      console.log('Database connection has been established successfully.');
      if (typeof db.sequelize.sync === 'function') {
        // Disable foreign keys temporarily to allow SQLite to handle table alterations
        const dialect = db.sequelize.getDialect();
        if (dialect === 'sqlite') {
          await db.sequelize.query('PRAGMA foreign_keys = OFF');
        }
        // Note: If you have "Validation error" with existing data, uncomment the next line to reset DB (DATA LOSS)
        // Using force:true in dev resets the DB and fixes sync issues (like Checkins_backup error).
        // await db.sequelize.sync({ force: true });
        // await db.sequelize.sync({ alter: true });
        // await db.sequelize.sync({ force: true });
        await db.sequelize.sync({ alter: true });

        // Ensure Teams table exists (Raw SQL table)
        await db.sequelize.query(`
          CREATE TABLE IF NOT EXISTS Teams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            companyCode TEXT,
            createdAt DATETIME,
            updatedAt DATETIME
          );
        `);

        // Ensure Users has teamId
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
  app.use('/api/auth', authRoutes);
  app.use('/api/checkins', checkinRoutes);
  app.use('/api/predict', predictRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/action-impact', simulatorRoutes);
  app.use('/api/teams', require('./routes/teams'));
  app.use('/api/gamification', require('./routes/gamification'));

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