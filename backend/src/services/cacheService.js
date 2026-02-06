const NodeCache = require('node-cache');

class CacheService {
  constructor() {
    // Default TTL: 5 minutes, Check period: 1 minute
    this.cache = new NodeCache({ stdTTL: 300, checkperiod: 60, useClones: false });

    this.cache.on('expired', (key, value) => {
      console.log(`[Cache] 🗑️ Key expired: ${key}`);
    });
  }

  get(key) {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // console.log(`[Cache] ✅ HIT: ${key}`); // Uncomment for verbose debugging
      return value;
    }
    // console.log(`[Cache] ❌ MISS: ${key}`);
    return null;
  }

  set(key, value, ttl) {
    try {
      return this.cache.set(key, value, ttl);
    } catch (err) {
      console.error(`[Cache] Error setting key ${key}:`, err.message);
      return false;
    }
  }

  del(key) {
    this.cache.del(key);
  }

  /**
   * Delete all keys matching a specific pattern (e.g., 'report:user:1:*')
   */
  delPattern(pattern) {
    const keys = this.cache.keys();
    const matches = keys.filter(k => k.includes(pattern));
    if (matches.length > 0) {
      this.cache.del(matches);
      console.log(`[Cache] 🧹 Cleared ${matches.length} keys matching pattern: ${pattern}`);
    }
  }

  flush() {
    this.cache.flushAll();
    console.log('[Cache] 💥 Cache flushed completely.');
  }

  getStats() {
    return this.cache.getStats();
  }
}

module.exports = new CacheService();