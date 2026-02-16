const crypto = require('node:crypto');

const ALGORITHM = 'aes-256-cbc';
// The encryption key must be 32 bytes (64 hex characters)
// Ensure process.env.ENCRYPTION_KEY is set in your .env file
const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY || '', 'hex');
const IV_LENGTH = 16;

if (ENCRYPTION_KEY.length !== 32) {
  console.warn(`⚠️ WARNING: ENCRYPTION_KEY is not 32 bytes (got ${ENCRYPTION_KEY.length}). Encryption/Decryption will fail. Ensure .env has a 64-char hex string.`);
}

const encrypt = (text) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
};

const decrypt = (text) => {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
};

module.exports = { encrypt, decrypt };