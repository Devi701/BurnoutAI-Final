const cacheService = require('../services/cacheService');

const getSystemHealth = () => {
  const cacheStats = cacheService.getStats();
  const memoryUsage = process.memoryUsage();

  return {
    status: 'online',
    timestamp: new Date().toISOString(),
    cache: {
      ...cacheStats,
      utilization: `${cacheStats.keys} keys stored`
    },
    memory: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB used`
  };
};

module.exports = { getSystemHealth };