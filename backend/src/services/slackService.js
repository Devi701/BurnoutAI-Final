const axios = require('axios');
const { DataTypes } = require('sequelize');
const db = require('../config/database');
const { decrypt } = require('../utils/encryption');

// --- Define Slack Activity Model ---
const SlackActivity = db.sequelize.define('SlackActivity', {
  userId: { type: DataTypes.INTEGER, allowNull: false },
  date: { type: DataTypes.DATEONLY }, // YYYY-MM-DD
  messageCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  channelCount: { type: DataTypes.INTEGER, defaultValue: 0 }
});

db.sequelize.sync({ alter: true }).catch(err => console.error('Slack Model Sync Error:', err));

exports.syncSlackData = async (userId) => {
  try {
    const integration = await db.UserIntegration.findOne({
      where: { userId: Number(userId), provider: 'slack' }
    });

    if (!integration || !integration.accessToken) return;
    const token = decrypt(integration.accessToken);

    // Search for messages sent by the user "from:me"
    // Note: Requires 'search:read' scope
    const response = await axios.get('https://slack.com/api/search.messages', {
      headers: { Authorization: `Bearer ${token}` },
      params: { 
        query: 'from:me', 
        sort: 'timestamp', 
        sort_dir: 'desc',
        count: 100 
      }
    });

    if (!response.data.ok) throw new Error(response.data.error);

    const messages = response.data.messages.matches || [];
    
    // Aggregate by date
    const dailyStats = {};

    messages.forEach(msg => {
      const date = new Date(msg.ts * 1000).toISOString().split('T')[0];
      if (!dailyStats[date]) dailyStats[date] = { count: 0, channels: new Set() };
      dailyStats[date].count++;
      dailyStats[date].channels.add(msg.channel.id);
    });

    for (const [date, stats] of Object.entries(dailyStats)) {
      await SlackActivity.upsert({
        userId: Number(userId),
        date: date,
        messageCount: stats.count,
        channelCount: stats.channels.size
      });
    }

    console.log(`Synced Slack activity for user ${userId}`);
  } catch (error) {
    console.error(`Slack Sync Error for user ${userId}:`, error.message);
  }
};