const { DataTypes } = require('sequelize');
const db = require('../config/database');

// Handle both export patterns
const sequelize = db.sequelize || db;

const TrelloCard = sequelize.define('TrelloCard', {
  userId: { type: DataTypes.INTEGER, allowNull: false },
  cardId: { type: DataTypes.STRING },
  name: { type: DataTypes.STRING },
  desc: { type: DataTypes.TEXT },
  boardName: { type: DataTypes.STRING },
  listName: { type: DataTypes.STRING },
  due: { type: DataTypes.DATE },
  url: { type: DataTypes.STRING },
  lastActivity: { type: DataTypes.DATE }
}, {
  indexes: [{ unique: true, fields: ['userId', 'cardId'] }]
});

module.exports = TrelloCard;