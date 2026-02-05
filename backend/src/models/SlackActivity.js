const { DataTypes } = require('sequelize');
const db = require('../config/database');

// Handle both export patterns
const sequelize = db.sequelize || db;

const SlackActivity = sequelize.define('SlackActivity', {
  userId: { type: DataTypes.INTEGER, allowNull: false },
  date: { type: DataTypes.DATEONLY }, // YYYY-MM-DD
  messageCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  channelCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  lastActiveTime: { type: DataTypes.DATE } // Track latest activity for the day
}, {
  indexes: [{ unique: true, fields: ['userId', 'date'] }]
});

module.exports = SlackActivity;