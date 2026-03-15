const { Sequelize, DataTypes } = require('sequelize');
const fs = require('node:fs');
const path = require('node:path');

// Determine connection settings
const databaseUrl = process.env.DATABASE_URL && process.env.DATABASE_URL.trim();

let sequelize;

function withSslmodeRequire(rawUrl) {
  // Supabase commonly expects TLS.
  // pg/pg-connection-string currently treats sslmode=require/prefer/verify-ca as verify-full unless:
  // - you explicitly set sslmode=verify-full, or
  // - you opt into libpq semantics with uselibpqcompat=true&sslmode=require.
  let url;
  try {
    url = new URL(rawUrl);
  } catch (e) {
    throw new Error(`Invalid DATABASE_URL (must be a valid URL): ${e.message}`);
  }

  const hasCa =
    Boolean(process.env.DATABASE_CA_CERT && process.env.DATABASE_CA_CERT.trim()) ||
    Boolean(process.env.DATABASE_CA_CERT_PATH && process.env.DATABASE_CA_CERT_PATH.trim());

  const sslmode = url.searchParams.get('sslmode');
  const uselibpqcompat = url.searchParams.get('uselibpqcompat');

  if (!sslmode) {
    if (hasCa) {
      // Strongest option, matches current (verify-full) behavior and avoids the warning.
      url.searchParams.set('sslmode', 'verify-full');
    } else {
      // Libpq-compatible require (does not imply verify-full). Also avoids the warning.
      url.searchParams.set('uselibpqcompat', 'true');
      url.searchParams.set('sslmode', 'require');
    }
  } else {
    // If user provided a legacy sslmode that triggers the warning, normalize it.
    if (!uselibpqcompat && (sslmode === 'prefer' || sslmode === 'require' || sslmode === 'verify-ca')) {
      if (hasCa) {
        url.searchParams.set('sslmode', 'verify-full');
      } else {
        url.searchParams.set('uselibpqcompat', 'true');
      }
    }
  }

  return url.toString();
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
  return null;
}

// Use Postgres when DATABASE_URL is present; otherwise fall back to local SQLite.
if (databaseUrl) {
  const urlWithSslmode = withSslmodeRequire(databaseUrl);
  const ca = readCaFromEnv();

  // Fix for: "self-signed certificate in certificate chain"
  // If a CA is provided, validate against it. Otherwise, fall back to rejectUnauthorized=false.
  const ssl = ca
    ? { require: true, rejectUnauthorized: true, ca }
    : { require: true, rejectUnauthorized: false };

  // Postgres (Supabase/Railway/Production)
  sequelize = new Sequelize(urlWithSslmode, {
    dialect: 'postgres',
    protocol: 'postgres',
    logging: false,
    pool: {
      max: Number(process.env.DB_POOL_MAX || 25),
      min: Number(process.env.DB_POOL_MIN || 3),
      acquire: Number(process.env.DB_POOL_ACQUIRE_MS || 30000),
      idle: Number(process.env.DB_POOL_IDLE_MS || 10000)
    },
    dialectOptions: {
      // Passing an object (not boolean) avoids newer pg SSL deprecation/warnings.
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
