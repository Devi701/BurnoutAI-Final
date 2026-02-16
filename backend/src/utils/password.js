const argon2 = require('argon2');

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// Configuration for Argon2id. Defaults target balanced auth latency;
// tune per environment with ARGON2_* env vars.
const HASH_CONFIG = {
  type: argon2.argon2id,
  memoryCost: toInt(process.env.ARGON2_MEMORY_COST, 19456), // 19 MB
  timeCost: toInt(process.env.ARGON2_TIME_COST, 2),
  parallelism: toInt(process.env.ARGON2_PARALLELISM, 1),
};

const hashPassword = async (password) => {
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }
  return await argon2.hash(password, HASH_CONFIG);
};

const verifyPassword = async (hash, password) => {
  try {
    return await argon2.verify(hash, password);
  } catch (err) {
    // Handle internal errors or malformed hashes securely.
    return false;
  }
};

const needsRehash = (hash) => {
  try {
    return argon2.needsRehash(hash, HASH_CONFIG);
  } catch (err) {
    console.error('Rehash check error:', err.message);
    return false;
  }
};

module.exports = {
  hashPassword,
  verifyPassword,
  needsRehash
};
