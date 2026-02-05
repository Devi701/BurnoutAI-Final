const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retries an async operation with exponential backoff.
 * @param {Function} operation - The async function to execute.
 * @param {number} maxRetries - Maximum number of retries (default 3).
 * @param {number} delay - Initial delay in ms (default 1000).
 */
const retryOperation = async (operation, maxRetries = 3, delay = 1000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      const waitTime = delay * Math.pow(2, i);
      console.warn(`⚠️ API Call failed. Retrying in ${waitTime}ms... (Attempt ${i + 1}/${maxRetries})`);
      await sleep(waitTime);
    }
  }
};

module.exports = { retryOperation, sleep };