const argon2 = require('argon2');

// Configuration for Argon2id (OWASP recommendations)
const HASH_CONFIG = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3,       // 3 iterations
  parallelism: 2,    // 2 threads
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
    // Handle internal errors or malformed hashes securely
    return false;
  }
};

const needsRehash = (hash) => {
  try {
    return argon2.needsRehash(hash, HASH_CONFIG);
  } catch (err) {
    return false;
  }
};

module.exports = {
  hashPassword,
  verifyPassword,
  needsRehash
};