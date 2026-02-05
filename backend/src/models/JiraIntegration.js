const { DataTypes } = require('sequelize');
const db = require('../config/database');

// Handle both export patterns (object with sequelize or direct instance)
const sequelize = db.sequelize || db;

const JiraIntegration = sequelize.define('JiraIntegration', {
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true
  },
  accessToken: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  refreshToken: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  cloudId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false
  },
  lastSyncedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
});

module.exports = JiraIntegration;