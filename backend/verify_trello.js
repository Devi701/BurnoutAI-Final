require('dotenv').config();
const db = require('./src/config/database');
const TrelloCard = require('./src/models/TrelloCard');
const { decrypt } = require('./src/utils/encryption');

async function verifyTrelloData() {
  console.log('🔍 Starting Trello Data Verification...');

  try {
    await db.sequelize.authenticate();
    console.log('✅ Database connected.');

    // 1. Verify Integration Record & Security
    console.log('\n--- 🔐 Security Check (UserIntegrations) ---');
    const integrations = await db.UserIntegration.findAll({ where: { provider: 'trello' } });
    
    if (integrations.length === 0) {
      console.log('❌ No Trello integrations found. Did you complete the auth flow?');
    } else {
      integrations.forEach(i => {
        console.log(`✅ Found Integration for User ID: ${i.userId}`);
        
        // Check if it looks like an encrypted string (IV:Ciphertext)
        const isEncryptedFormat = i.accessToken.includes(':');
        console.log(`   🔒 Token Format Encrypted? ${isEncryptedFormat ? 'YES' : 'NO'}`);

        try {
          const decrypted = decrypt(i.accessToken);
          console.log(`   🔑 Decryption Test: SUCCESS (Token length: ${decrypted.length})`);
        } catch (e) {
          console.error(`   ❌ Decryption Test: FAILED (${e.message})`);
        }
      });
    }

    // 2. Verify Synced Data
    console.log('\n--- 🗂️  Data Check (TrelloCards) ---');
    const cardCount = await TrelloCard.count();
    console.log(`✅ Total Cards Stored: ${cardCount}`);

  } catch (error) {
    console.error('🔥 Verification Error:', error);
  } finally {
    await db.sequelize.close();
  }
}

verifyTrelloData();