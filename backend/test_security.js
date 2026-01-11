const axios = require('axios');

// Config
const BASE_URL = process.argv[2] || 'http://localhost:4000/api';
const EMAIL = 'boss@test.com';
const PASSWORD = 'password123';

async function runSecurityTests() {
  console.log(`🛡️  Starting Security Audit against: ${BASE_URL}\n`);

  let token = null;
  let userId = null;

  // --- 1. SQL Injection Test (Login) ---
  console.log('1️⃣  Testing SQL Injection (Login Bypass)...');
  try {
    await axios.post(`${BASE_URL}/auth/login`, {
      email: "' OR '1'='1",
      password: "' OR '1'='1"
    });
    console.log('   ❌ FAILED: SQL Injection might have succeeded (Login successful).');
  } catch (err) {
    if (err.response && err.response.status === 401) {
      console.log('   ✅ PASSED: SQL Injection blocked (401 Unauthorized).');
    } else if (err.response && err.response.status === 500) {
      console.log('   ⚠️  WARNING: Server error (500). Check logs for SQL syntax errors leaking.');
    } else {
      console.log(`   ✅ PASSED: Request rejected with status ${err.response ? err.response.status : 'Unknown'}.`);
    }
  }

  // --- 2. Sensitive Data Exposure ---
  console.log('\n2️⃣  Testing Sensitive Data Exposure...');
  try {
    let res;
    try {
      res = await axios.post(`${BASE_URL}/auth/login`, { email: EMAIL, password: PASSWORD });
    } catch (loginErr) {
      // Auto-create user if missing (Self-healing test)
      if (loginErr.response && (loginErr.response.status === 401 || loginErr.response.status === 404)) {
        console.log('   ℹ️  User not found. Creating test employer...');
        await axios.post(`${BASE_URL}/auth/signup/employer`, {
          email: EMAIL,
          password: PASSWORD,
          name: 'Security Test User',
          companyCode: 'SEC001'
        });
        res = await axios.post(`${BASE_URL}/auth/login`, { email: EMAIL, password: PASSWORD });
      } else throw loginErr;
    }

    token = res.data.token;
    userId = res.data.user.id;
    const userObj = res.data.user;

    const sensitiveFields = ['password', 'hash', 'salt', 'resetPasswordToken'];
    const leaked = sensitiveFields.filter(field => userObj.hasOwnProperty(field));

    if (leaked.length > 0) {
      console.log(`   ❌ FAILED: Sensitive fields exposed in response: ${leaked.join(', ')}`);
    } else {
      console.log('   ✅ PASSED: No sensitive user data found in login response.');
    }
  } catch (err) {
    console.log('   ⚠️  SKIPPED: Could not log in or create user. ' + err.message);
  }

  // --- 3. Unauthenticated Access Control ---
  console.log('\n3️⃣  Testing Unauthenticated Access...');
  try {
    // Try to access a protected route without a token
    await axios.get(`${BASE_URL}/reports/personal/me?userId=${userId || 1}`);
    console.log('   ❌ FAILED: Protected endpoint accessed without token.');
  } catch (err) {
    if (err.response && (err.response.status === 401 || err.response.status === 403)) {
      console.log('   ✅ PASSED: Access denied (401/403).');
    } else {
      console.log(`   ❓ UNEXPECTED: Status ${err.response ? err.response.status : err.message}`);
    }
  }

  // --- 4. Rate Limiting (Brute Force Protection) ---
  console.log('\n4️⃣  Testing Rate Limiting (Brute Force)...');
  console.log('   Sending 20 rapid login attempts...');
  const attempts = [];
  for (let i = 0; i < 20; i++) {
    attempts.push(
      axios.post(`${BASE_URL}/auth/login`, { email: 'hacker@test.com', password: 'wrongpassword' })
        .then(r => r.status)
        .catch(err => err.response ? err.response.status : 'Error')
    );
  }
  const results = await Promise.all(attempts);
  const rateLimitedCount = results.filter(s => s === 429).length;

  if (rateLimitedCount > 0) {
    console.log(`   ✅ PASSED: Rate limiting active (${rateLimitedCount} requests blocked).`);
  } else {
    console.log('   ❌ FAILED: No rate limiting detected (Brute force possible).');
  }

  // --- 5. Broken Object Level Authorization (BOLA/IDOR) ---
  console.log('\n5️⃣  Testing IDOR (Accessing another user\'s data)...');
  if (token && userId) {
    const targetId = userId + 1; // Try a different ID
    try {
      const res = await axios.get(`${BASE_URL}/checkins/history/${targetId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // If we get data back, check if it's actually data or empty
      if (res.data && res.data.checkins && res.data.checkins.length > 0) {
         console.log(`   ❌ FAILED: IDOR Vulnerability! Accessed data for User ID ${targetId} using User ID ${userId}'s token.`);
      } else if (res.data && res.data.checkins) {
         console.log(`   ⚠️  WARNING: Request succeeded for User ID ${targetId} (returned empty array). Backend should ideally block this.`);
      } else {
         console.log(`   ✅ PASSED: No data returned.`);
      }
    } catch (err) {
      if (err.response && (err.response.status === 403 || err.response.status === 401)) {
        console.log('   ✅ PASSED: Access to other user data denied.');
      } else if (err.response && err.response.status === 404) {
         console.log('   ℹ️  INCONCLUSIVE: Target user not found (404).');
      } else {
         console.log(`   ❓ UNEXPECTED: Status ${err.response ? err.response.status : err.message}`);
      }
    }
  } else {
    console.log('   ⚠️  SKIPPED: Need valid login to test IDOR.');
  }

  // --- 6. Database Error Leakage ---
  console.log('\n6️⃣  Testing Database Error Leakage...');
  try {
    // Send malformed payload to trigger DB error
    await axios.post(`${BASE_URL}/auth/signup`, {
      email: ["not", "a", "string"], // Type mismatch
      password: "pwd"
    });
    console.log('   ❌ FAILED: Request should have failed.');
  } catch (err) {
    if (err.response) {
      const body = JSON.stringify(err.response.data);
      const leaks = ['sequelize', 'sql', 'syntax', 'table', 'column'];
      const foundLeaks = leaks.filter(w => body.toLowerCase().includes(w));
      
      if (foundLeaks.length > 0) {
        console.log(`   ⚠️  WARNING: Error message might leak DB info: "${foundLeaks.join(', ')}" found.`);
      } else {
        console.log('   ✅ PASSED: Generic error message returned.');
      }
    }
  }

  console.log('\n🏁 Security Audit Complete.');
}

runSecurityTests();