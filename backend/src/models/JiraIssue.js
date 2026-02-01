const { DataTypes } = require('sequelize');
const db = require('../config/database');

const sequelize = db.sequelize || db;

const JiraIssue = sequelize.define('JiraIssue', {
  integrationId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  issueKey: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  summary: {
    type: DataTypes.STRING,
    allowNull: true
  },
  status: {
    type: DataTypes.STRING,
    allowNull: true
  },
  priority: {
    type: DataTypes.STRING,
    allowNull: true
  },
  storyPoints: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  assignee: {
    type: DataTypes.STRING,
    allowNull: true
  },
  createdDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  resolutionDate: {
    type: DataTypes.DATE,
    allowNull: true
  }
});

module.exports = JiraIssue;