const cacheService = require('../services/cacheService');

/**
 * Middleware to cache API responses.
 * @param {number} ttl - Time to live in seconds.
 * @param {function} keyGenerator - Optional function to generate custom cache keys.
 */
const cacheMiddleware = (ttl = 300, keyGenerator) => (req, res, next) => {
  // Only cache GET requests to be safe
  if (req.method !== 'GET') return next();

  const key = keyGenerator 
    ? keyGenerator(req) 
    : `route:${req.originalUrl || req.url}`;

  const cachedResponse = cacheService.get(key);

  if (cachedResponse) {
    console.log(`[Cache] 🚀 Serving route from cache: ${key}`);
    return res.json(cachedResponse);
  }

  // Intercept res.json to cache the response before sending
  const originalJson = res.json;
  res.json = (body) => {
    if (res.statusCode === 200) {
      cacheService.set(key, body, ttl);
    }
    return originalJson.call(res, body);
  };

  next();
};

module.exports = cacheMiddleware;