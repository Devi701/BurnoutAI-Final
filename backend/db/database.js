const { Sequelize, DataTypes } = require('sequelize');
const path = require('node:path');

// Determine connection settings
const databaseUrl = process.env.DATABASE_URL;

let sequelize;

// Only use remote DB if explicitly in production, otherwise use local SQLite to avoid connection errors during dev
if (databaseUrl && process.env.NODE_ENV === 'production') {
  // Postgres (Supabase/Railway/Production)
  sequelize = new Sequelize(databaseUrl, {
    dialect: 'postgres',
    protocol: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false // Required for Supabase/Heroku connections
      }
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
}, { tableName: 'checkins' });

// QuizResult Model
db.QuizResult = sequelize.define('QuizResult', {
  userId: { type: DataTypes.INTEGER },
  quizType: { type: DataTypes.STRING },
  score: { type: DataTypes.REAL },
  breakdown: { type: DataTypes.JSON }
});

// Team Model (Explicit table name to match raw SQL usage in other routes)
db.Team = sequelize.define('Team', {
  name: { type: DataTypes.STRING },
  companyCode: { type: DataTypes.STRING }
}, { tableName: 'Teams' });

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

module.exports = db;