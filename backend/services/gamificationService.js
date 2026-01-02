const { DataTypes, Op } = require('sequelize');
const db = require('../db/database');

// --- 1. Dynamic Model Definition ---
// We define these here to ensure they exist without altering the core database.js file manually.

const UserStats = db.sequelize.define('UserStats', {
  userId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  score: { type: DataTypes.INTEGER, defaultValue: 0 },
  level: { type: DataTypes.INTEGER, defaultValue: 1 },
  points: { type: DataTypes.INTEGER, defaultValue: 0 }, // Spendable currency
  referralCode: { type: DataTypes.STRING, unique: true },
  streak: { type: DataTypes.INTEGER, defaultValue: 0 },
  optInLeaderboard: { type: DataTypes.BOOLEAN, defaultValue: false } // Voluntary Opt-in
});

const Badge = db.sequelize.define('Badge', {
  slug: { type: DataTypes.STRING, unique: true },
  name: { type: DataTypes.STRING },
  description: { type: DataTypes.STRING },
  icon: { type: DataTypes.STRING }, // Emoji or URL
  scoreReward: { type: DataTypes.INTEGER, defaultValue: 0 }
});

const UserBadge = db.sequelize.define('UserBadge', {
  userId: { type: DataTypes.INTEGER },
  badgeId: { type: DataTypes.INTEGER }
});

const Referral = db.sequelize.define('Referral', {
  referrerId: { type: DataTypes.INTEGER },
  refereeId: { type: DataTypes.INTEGER },
  status: { type: DataTypes.STRING, defaultValue: 'completed' } // pending, completed
});

const Challenge = db.sequelize.define('Challenge', {
  slug: { type: DataTypes.STRING, unique: true },
  title: { type: DataTypes.STRING },
  description: { type: DataTypes.STRING },
  metric: { type: DataTypes.STRING }, // 'streak', 'checkin_count'
  target: { type: DataTypes.INTEGER },
  scoreReward: { type: DataTypes.INTEGER }
});

const UserChallenge = db.sequelize.define('UserChallenge', {
  userId: { type: DataTypes.INTEGER },
  challengeId: { type: DataTypes.INTEGER },
  progress: { type: DataTypes.INTEGER, defaultValue: 0 },
  completed: { type: DataTypes.BOOLEAN, defaultValue: false }
});

// Sync models (safe mode)
db.sequelize.sync({ alter: true }).catch(err => console.error('Gamification Sync Error:', err));

// --- 2. Game Rules Engine ---

const LEVEL_Curve = (level) => 100 * Math.pow(level, 1.5); // Score needed for next level

const RULES = {
  'daily_checkin': { score: 50, points: 10 },
  'referral_signup': { score: 500, points: 100 },
  'streak_bonus': { score: 20, points: 5 }, // Per day of streak
  'first_checkin': { score: 100, points: 20, badge: 'pioneer' }
};

// --- 3. Core Service Methods ---

const GamificationService = {
  
  // Initialize stats for a new user
  async initProfile(userId) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    return await UserStats.create({ userId, referralCode: code });
  },

  // Process an event (The "Engine" Core)
  async processEvent(userId, eventType, metadata = {}) {
    let stats = await UserStats.findOne({ where: { userId } });
    if (!stats) stats = await this.initProfile(userId);

    const rule = RULES[eventType];
    if (!rule) return null;

    // 1. Award Score & Points
    let scoreGain = rule.score || 0;
    let pointsGain = rule.points || 0;

    // Dynamic Multipliers (e.g., Streak)
    if (eventType === 'daily_checkin' && metadata.streak > 1) {
      scoreGain += (metadata.streak * 5); // 5 extra Score per streak day
    }

    stats.score += scoreGain;
    stats.points += pointsGain;
    if (metadata.streak) stats.streak = metadata.streak;

    // 2. Check Level Up
    const scoreNeeded = LEVEL_Curve(stats.level);
    let leveledUp = false;
    if (stats.score >= scoreNeeded) {
      stats.level += 1;
      leveledUp = true;
      // Bonus for leveling up
      stats.points += 50; 
    }

    await stats.save();

    // 3. Check Badges (Simple Rule: If rule has badge, award it)
    let newBadge = null;
    if (rule.badge) {
      newBadge = await this.awardBadge(userId, rule.badge);
    }

    // 4. Update Active Challenges
    const activeChallenges = await UserChallenge.findAll({ where: { userId, completed: false } });
    for (const uc of activeChallenges) {
      const challenge = await Challenge.findByPk(uc.challengeId);
      if (!challenge) continue;

      let newProgress = uc.progress;
      if (challenge.metric === 'streak' && eventType === 'daily_checkin') {
        newProgress = metadata.streak || uc.progress;
      } else if (challenge.metric === 'checkin_count' && eventType === 'daily_checkin') {
        newProgress += 1;
      }

      if (newProgress >= challenge.target) {
        uc.progress = challenge.target;
        uc.completed = true;
        stats.score += challenge.scoreReward; // Award Challenge Score
        await stats.save();
      } else {
        uc.progress = newProgress;
      }
      await uc.save();
    }

    return { 
      scoreGain, 
      pointsGain, 
      leveledUp, 
      newLevel: stats.level, 
      newBadge 
    };
  },

  async awardBadge(userId, badgeSlug) {
    // Ensure badge exists
    let badge = await Badge.findOne({ where: { slug: badgeSlug } });
    if (!badge) {
      // Auto-create badge definition if missing (for modularity)
      badge = await Badge.create({ 
        slug: badgeSlug, 
        name: badgeSlug.replace('_', ' ').toUpperCase(), 
        description: 'Awarded for milestone achievement.',
        icon: '🏆'
      });
    }

    // Check if user already has it
    const hasBadge = await UserBadge.findOne({ where: { userId, badgeId: badge.id } });
    if (hasBadge) return null;

    await UserBadge.create({ userId, badgeId: badge.id });
    return badge;
  },

  async processReferral(referralCode, newUserId) {
    const referrerStats = await UserStats.findOne({ where: { referralCode } });
    if (!referrerStats) return false;

    // Record Referral
    await Referral.create({ referrerId: referrerStats.userId, refereeId: newUserId });

    // Reward Referrer
    await this.processEvent(referrerStats.userId, 'referral_signup');
    
    // Reward Referee (New User)
    await this.processEvent(newUserId, 'referral_signup'); // Bonus for using a code

    return true;
  },

  async updateSettings(userId, settings) {
    let stats = await UserStats.findOne({ where: { userId } });
    if (!stats) stats = await this.initProfile(userId);
    
    if (settings.optInLeaderboard !== undefined) {
      stats.optInLeaderboard = settings.optInLeaderboard;
    }
    await stats.save();
    return stats;
  },

  async getChallenges(userId) {
    // Seed defaults if table empty
    const count = await Challenge.count();
    if (count === 0) {
      const defaults = [
        { slug: '7_day_streak', title: '7-Day Streak', description: 'Log a check-in for 7 days in a row.', metric: 'streak', target: 7, scoreReward: 500 },
        { slug: 'wellness_warrior', title: 'Wellness Warrior', description: 'Complete 10 total check-ins.', metric: 'checkin_count', target: 10, scoreReward: 1000 }
      ];
      for (const c of defaults) await Challenge.create(c);
    }

    const all = await Challenge.findAll();
    const userChallenges = await UserChallenge.findAll({ where: { userId } });
    
    return all.map(c => {
      const uc = userChallenges.find(u => u.challengeId === c.id);
      return {
        ...c.toJSON(),
        joined: !!uc,
        progress: uc ? uc.progress : 0,
        completed: uc ? uc.completed : false
      };
    });
  },

  async joinChallenge(userId, challengeId) {
    return await UserChallenge.findOrCreate({ where: { userId, challengeId } });
  },

  async getLeaderboard(limit = 10) {
    const leaders = await UserStats.findAll({
      where: { optInLeaderboard: true }, // Only show opted-in users
      order: [['score', 'DESC']],
      limit,
      include: [] // In a real app, include User model to get names
    });
    
    // Fetch names manually since associations might not be set up in this dynamic file
    const enriched = await Promise.all(leaders.map(async (l) => {
      const u = await db.User.findByPk(l.userId);
      return {
        name: u ? u.name : 'Unknown',
        score: l.score || 0,
        level: l.level,
        avatar: u ? u.name.charAt(0).toUpperCase() : '?'
      };
    }));
    
    return enriched;
  },

  async getProfile(userId) {
    let stats = await UserStats.findOne({ where: { userId } });
    if (!stats) stats = await this.initProfile(userId);

    const userBadges = await UserBadge.findAll({ where: { userId } });
    const badgeIds = userBadges.map(ub => ub.badgeId);
    const badges = await Badge.findAll({ where: { id: { [Op.in]: badgeIds } } });

    return { stats, badges };
  }
};

// Export the service
module.exports = GamificationService;