const axios = require('axios');
const { DataTypes } = require('sequelize');
const db = require('../config/database');
const { decrypt } = require('../utils/encryption');

// --- Define Trello Model ---
const TrelloCard = db.sequelize.define('TrelloCard', {
  trelloId: { type: DataTypes.STRING, unique: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  name: { type: DataTypes.STRING },
  due: { type: DataTypes.DATE },
  closed: { type: DataTypes.BOOLEAN }, // True if archived/completed
  dateLastActivity: { type: DataTypes.DATE }
});

db.sequelize.sync({ alter: true }).catch(err => console.error('Trello Model Sync Error:', err));

exports.syncTrelloData = async (userId) => {
  try {
    const integration = await db.UserIntegration.findOne({
      where: { userId: Number(userId), provider: 'trello' }
    });

    if (!integration || !integration.accessToken) return;
    const token = decrypt(integration.accessToken);
    // Trello usually requires an API Key + Token. 
    // Assuming metadata stores the API Key or token is sufficient for the specific auth flow used.
    const apiKey = process.env.TRELLO_API_KEY; 

    const response = await axios.get(`https://api.trello.com/1/members/me/cards`, {
      params: {
        key: apiKey,
        token: token,
        fields: 'name,due,closed,dateLastActivity'
      }
    });

    const cards = response.data || [];

    for (const card of cards) {
      await TrelloCard.upsert({
        trelloId: card.id,
        userId: Number(userId),
        name: card.name,
        due: card.due,
        closed: card.closed,
        dateLastActivity: card.dateLastActivity
      });
    }

    console.log(`Synced ${cards.length} Trello cards for user ${userId}`);
  } catch (error) {
    console.error(`Trello Sync Error for user ${userId}:`, error.message);
  }
};