const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

// Determine connection settings
const databaseUrl = process.env.DATABASE_URL;

let sequelize;

if (databaseUrl) {
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
  stress: { type: DataTypes.REAL },
  sleep: { type: DataTypes.REAL },
  workload: { type: DataTypes.REAL },
  coffee: { type: DataTypes.REAL },
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

module.exports = db;