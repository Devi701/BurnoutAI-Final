const { DataTypes } = require('sequelize');
const db = require('../config/database');

// Handle both export patterns
const sequelize = db.sequelize || db;

const CalendarEvent = sequelize.define('CalendarEvent', {
  googleEventId: { type: DataTypes.STRING, unique: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  summary: { type: DataTypes.STRING },
  description: { type: DataTypes.TEXT },
  location: { type: DataTypes.STRING },
  startTime: { type: DataTypes.DATE },
  endTime: { type: DataTypes.DATE },
  attendees: { type: DataTypes.JSON }, // Storing attendees as JSON
  htmlLink: { type: DataTypes.STRING },
  status: { type: DataTypes.STRING },
  eventType: { type: DataTypes.STRING }, // 'default', 'focusTime', 'outOfOffice'
  creator: { type: DataTypes.JSON },
  meetingCount: { type: DataTypes.INTEGER, defaultValue: 1 } // Helper for aggregation
});

module.exports = CalendarEvent;