const axios = require('axios');

// 1. Configurable Target & Concurrency
const BASE_URL = process.argv[2] || 'http://localhost:4000/api';
const CONCURRENT_REQUESTS = Number.parseInt(process.argv[3]) || 50;

// Using the seeded employer credentials from seed_db.js
const EMAIL = 'boss@test.com';
const PASSWORD = 'password123';

async function runPerformanceTest() {
  console.log(`🚀 Starting Performance Test against: ${BASE_URL}`);
  console.log(`   Concurrency: ${CONCURRENT_REQUESTS} requests`);

  try {
    // 1. Login to get token
    console.log('🔑 Logging in...');
    let loginRes;
    try {
      loginRes = await axios.post(`${BASE_URL}/auth/login`, {
        email: EMAIL,
        password: PASSWORD
      });
    } catch (err) {
      // Handle 401 (Wrong password/User exists) or 404 (User doesn't exist)
      if (err.response && (err.response.status === 401 || err.response.status === 404)) {
        console.log('⚠️ User not found. Creating test employer...');
        loginRes = await axios.post(`${BASE_URL}/auth/signup/employer`, {
          email: EMAIL,
          password: PASSWORD,
          name: 'Test Employer',
          companyCode: 'TEST01'
        });
      } else throw err;
    }

    const { token, user } = loginRes.data;
    console.log(`✅ Logged in as ${user.email} (${user.companyCode})`);

    // 2. Define the payload
    const payload = {
      companyCode: user.companyCode,
      plan: {
        name: 'Performance Test Plan',
        actions: [
          { type: 'workload', intensity: 50, adherence: 80 },
          { type: 'recovery', intensity: 50, adherence: 80 }
        ],
        durationWeeks: 12,
        avgHourlyRate: 60
      }
    };

    // 3. Run concurrent requests
    console.log(`🔥 Sending requests...`);
    
    const latencies = [];
    let successCount = 0;
    let failCount = 0;
    
    const startTime = Date.now();
    
    const requests = Array.from({ length: CONCURRENT_REQUESTS }).map(async (_, i) => {
      const reqStart = Date.now();
      try {
        await axios.post(`${BASE_URL}/employer-simulator/simulate`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        successCount++;
        process.stdout.write('.');
      } catch (error) {
        failCount++;
        process.stdout.write('x');
      }
      const reqEnd = Date.now();
      latencies.push(reqEnd - reqStart);
    });

    await Promise.all(requests);
    
    const endTime = Date.now();
    const totalDuration = endTime - startTime;

    // Stats Calculation
    latencies.sort((a, b) => a - b);
    const min = latencies[0];
    const max = latencies.at(-1);
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];

    console.log('\n\n📊 Results:');
    console.log(`   Total Duration: ${totalDuration}ms`);
    console.log(`   Successful: ${successCount}`);
    console.log(`   Failed:     ${failCount}`);
    console.log(`   Throughput: ${(successCount / (totalDuration / 1000)).toFixed(2)} req/sec`);
    console.log('   Latency:');
    console.log(`     Min: ${min}ms`);
    console.log(`     Max: ${max}ms`);
    console.log(`     Avg: ${avg.toFixed(2)}ms`);
    console.log(`     P95: ${p95}ms`);
    console.log(`     P99: ${p99}ms`);

  } catch (error) {
    console.error('\n❌ Test Setup Failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
  }
}

try {
  await runPerformanceTest();
} catch (error) {
  console.error(error);
}