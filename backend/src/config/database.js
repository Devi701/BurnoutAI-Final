const { Sequelize, DataTypes } = require('sequelize');
const fs = require('node:fs');
const path = require('node:path');

// Determine connection settings
const databaseUrl = process.env.DATABASE_URL && process.env.DATABASE_URL.trim();

let sequelize;

const BUNDLED_CA_PATH = path.join(__dirname, '../../certs/prod-ca-2021.crt');

function parseDatabaseUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch (e) {
    throw new Error(`Invalid DATABASE_URL (must be a valid URL): ${e.message}`);
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error(`Invalid DATABASE_URL protocol (${url.protocol}). Expected postgres:// or postgresql://`);
  }
  const dbName = url.pathname && url.pathname !== '/' ? url.pathname.slice(1) : 'postgres';
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    database: dbName,
    username: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
  };
}

function readCaFromEnv() {
  // Preferred: provide a CA PEM string directly.
  if (process.env.DATABASE_CA_CERT && process.env.DATABASE_CA_CERT.trim()) {
    // Many platforms store PEM in env vars with literal "\n". Normalize it.
    return process.env.DATABASE_CA_CERT.trim().replace(/\\n/g, '\n');
  }
  // Alternative: provide a filesystem path to a CA PEM file.
  if (process.env.DATABASE_CA_CERT_PATH && process.env.DATABASE_CA_CERT_PATH.trim()) {
    const p = process.env.DATABASE_CA_CERT_PATH.trim();
    try {
      return fs.readFileSync(p, 'utf8');
    } catch (e) {
      throw new Error(`Failed to read DATABASE_CA_CERT_PATH (${p}): ${e.message}`);
    }
  }
  // Bundled Supabase CA (checked into the repo) as a safe default for Render deployments.
  if (fs.existsSync(BUNDLED_CA_PATH)) {
    return fs.readFileSync(BUNDLED_CA_PATH, 'utf8');
  }
  return null;
}

// Use Postgres when DATABASE_URL is present; otherwise fall back to local SQLite.
if (databaseUrl) {
  const { host, port, database, username, password } = parseDatabaseUrl(databaseUrl);
  const ca = readCaFromEnv();

  // TLS settings:
  // - If a CA is provided, validate against it (recommended).
  // - Otherwise, fall back to rejectUnauthorized=false for compatibility with self-signed chains.
  // Note: pg expects `ssl` to be an object with Node TLS options (not `{ require: true }`).
  const ssl = ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: false };

  // Postgres (Supabase/Railway/Production)
  sequelize = new Sequelize(database, username, password, {
    dialect: 'postgres',
    protocol: 'postgres',
    logging: false,
    host,
    port,
    pool: {
      max: Number(process.env.DB_POOL_MAX || 25),
      min: Number(process.env.DB_POOL_MIN || 3),
      acquire: Number(process.env.DB_POOL_ACQUIRE_MS || 30000),
      idle: Number(process.env.DB_POOL_IDLE_MS || 10000)
    },
    dialectOptions: {
      // Passing an object (not boolean) avoids pg SSL ambiguity/warnings and lets us inject the CA.
      ssl
    }
  });
} else {
  // Warn if we are in production but missing the DB URL (Explains why data resets)
  if (process.env.NODE_ENV === 'production') {
    console.warn('⚠️  WARNING: No DATABASE_URL found. Using ephemeral SQLite in production. Data will be lost on restart.');
  }
  // SQLite (Development)
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, '../../database.sqlite'),
    logging: false
  });
}

const db = { sequelize, Sequelize };

// --- Define Models ---

// User Model
  db.User = sequelize.define('User', {
  name: { type: DataTypes.STRING },
  email: { type: DataTypes.STRING, unique: true },
  password: { type: DataTypes.STRING },
  role: { type: DataTypes.STRING },
  industry: { type: DataTypes.STRING },
  companyCode: { type: DataTypes.STRING },
  resetPasswordToken: { type: DataTypes.STRING },
  resetPasswordExpires: { type: DataTypes.INTEGER },
  teamId: { type: DataTypes.INTEGER }
  }, {
    indexes: [
      { fields: ['email'], unique: true },
      { fields: ['companyCode', 'role'] },
      { fields: ['companyCode', 'teamId'] }
    ]
  });

// Checkin Model
  db.Checkin = sequelize.define('Checkin', {
  userId: { type: DataTypes.INTEGER },
  companyCode: { type: DataTypes.STRING },
  // 1. Recovery / Energy
  energy: { type: DataTypes.INTEGER }, // 0-100 (Required)
  sleepHours: { type: DataTypes.REAL }, // 0-12
  sleepQuality: { type: DataTypes.INTEGER }, // 1-5
  breaks: { type: DataTypes.INTEGER }, // Minutes
  middayEnergy: { type: DataTypes.INTEGER }, // 0-100
  // 2. Stress / Pressure
  stress: { type: DataTypes.INTEGER }, // 0-100 (Required)
  workload: { type: DataTypes.INTEGER }, // 1-5
  anxiety: { type: DataTypes.INTEGER }, // 1-5
  // 3. Engagement / Motivation
  engagement: { type: DataTypes.INTEGER }, // 0-100
  mood: { type: DataTypes.INTEGER }, // 1-5
  motivation: { type: DataTypes.INTEGER }, // 1-5
  // 4. Collaboration / Social & 5. External
  peerSupport: { type: DataTypes.INTEGER }, // 1-5
  managementSupport: { type: DataTypes.INTEGER }, // 1-5
  commuteStress: { type: DataTypes.INTEGER }, // 1-5
  note: { type: DataTypes.TEXT }
  }, {
    tableName: 'checkins',
    indexes: [
      { fields: ['userId', 'createdAt'] },
      { fields: ['companyCode', 'createdAt'] },
      { fields: ['createdAt'] }
    ]
  });

// QuizResult Model
  db.QuizResult = sequelize.define('QuizResult', {
  userId: { type: DataTypes.INTEGER },
  quizType: { type: DataTypes.STRING },
  score: { type: DataTypes.REAL },
  breakdown: { type: DataTypes.JSON }
  }, {
    indexes: [
      { fields: ['userId', 'quizType', 'createdAt'] }
    ]
  });

// Team Model (Explicit table name to match raw SQL usage in other routes)
  db.Team = sequelize.define('Team', {
  name: { type: DataTypes.STRING },
  companyCode: { type: DataTypes.STRING }
  }, {
    tableName: 'Teams',
    indexes: [{ fields: ['companyCode'] }]
  });

// Survey Model
db.Survey = sequelize.define('Survey', {
  companyCode: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  questions: { type: DataTypes.JSON, allowNull: false }, // e.g., [{id: 'q1', text: '...', type: 'scale'}]
  isActive: { type: DataTypes.BOOLEAN, defaultValue: false }
}, { tableName: 'surveys' });

// SurveyResponse Model
db.SurveyResponse = sequelize.define('SurveyResponse', {
  surveyId: { type: DataTypes.INTEGER, allowNull: false },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  answers: { type: DataTypes.JSON, allowNull: false } // e.g., {q1: 5, q2: 'text answer'}
}, { tableName: 'survey_responses' });

// UserIntegration Model (For OAuth Tokens)
db.UserIntegration = sequelize.define('UserIntegration', {
  userId: { type: DataTypes.INTEGER, allowNull: false, unique: false },
  provider: { type: DataTypes.STRING, allowNull: false }, // e.g., 'google'
  accessToken: { type: DataTypes.TEXT, allowNull: false },
  refreshToken: { type: DataTypes.TEXT },
  expiresAt: { type: DataTypes.DATE },
  lastSyncedAt: { type: DataTypes.DATE }
}, { 
  tableName: 'user_integrations',
  indexes: [{ unique: true, fields: ['userId', 'provider'] }]
});

module.exports = db;
