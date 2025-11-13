/**
 * Withings Integration Test Script
 *
 * Usage:
 * 1. Login to your app first to get a JWT token
 * 2. Run: node test-withings.js YOUR_JWT_TOKEN
 *
 * Or manually test via browser:
 * 1. Login at http://127.0.0.1:5173
 * 2. Get JWT from browser DevTools (Application > Cookies > accessToken)
 * 3. Visit: http://127.0.0.1:3000/withings/oauth/authorize (with JWT in header)
 */

import axios from 'axios';

const BASE_URL = 'http://127.0.0.1:3000';
const jwtToken = process.argv[2];

if (!jwtToken) {
  console.log('❌ Please provide a JWT token as an argument');
  console.log('Usage: node test-withings.js YOUR_JWT_TOKEN');
  console.log('');
  console.log('To get a JWT token:');
  console.log('1. Login at http://127.0.0.1:5173');
  console.log('2. Open DevTools > Application > Cookies');
  console.log('3. Copy the "accessToken" value');
  console.log('');
  console.log('OR test manually in browser:');
  console.log('1. Login at http://127.0.0.1:5173');
  console.log('2. Open: http://127.0.0.1:3000/withings/oauth/authorize');
  console.log('3. Follow the authorization flow');
  process.exit(1);
}

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Authorization': `Bearer ${jwtToken}`
  }
});

async function testWithingsIntegration() {
  console.log('🧪 Testing Withings Integration\n');

  try {
    // Test 1: Check connection status
    console.log('1️⃣ Checking connection status...');
    const statusRes = await client.get('/withings/status');
    console.log('✅ Status:', JSON.stringify(statusRes.data, null, 2));
    console.log('');

    if (statusRes.data.connected) {
      console.log('🎉 Already connected! Testing data endpoints...\n');

      // Test data endpoints
      await testDataEndpoints();
    } else {
      console.log('📱 Not connected. Getting authorization URL...\n');

      // Test 2: Get authorization URL
      console.log('2️⃣ Getting authorization URL...');
      const authRes = await client.get('/withings/oauth/authorize');
      console.log('✅ Authorization URL received');
      console.log('');
      console.log('🔗 Open this URL in your browser to authorize:');
      console.log(authRes.data.authUrl);
      console.log('');
      console.log('After authorizing, Withings will redirect you back.');
      console.log('Then run this script again to test data endpoints!');
    }

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

async function testDataEndpoints() {
  try {
    // Test 3: Get measurements
    console.log('3️⃣ Fetching measurements (last 7 days)...');
    const endDate = new Date().toISOString();
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const measureRes = await client.get('/withings/data/measurements', {
      params: { startDate, endDate }
    });
    console.log('✅ Measurements:', measureRes.data.data.measurements.length, 'records');
    if (measureRes.data.data.measurements.length > 0) {
      console.log('   Latest:', JSON.stringify(measureRes.data.data.measurements[0], null, 2));
    }
    console.log('');

    // Test 4: Get activity
    console.log('4️⃣ Fetching activity data (last 7 days)...');
    const activityRes = await client.get('/withings/data/activity', {
      params: { startDate, endDate }
    });
    console.log('✅ Activity:', activityRes.data.data.length, 'days');
    if (activityRes.data.data.length > 0) {
      console.log('   Latest:', JSON.stringify(activityRes.data.data[0], null, 2));
    }
    console.log('');

    // Test 5: Get sleep
    console.log('5️⃣ Fetching sleep data (last 7 days)...');
    const sleepRes = await client.get('/withings/data/sleep', {
      params: { startDate, endDate }
    });
    console.log('✅ Sleep:', sleepRes.data.data.length, 'nights');
    if (sleepRes.data.data.length > 0) {
      console.log('   Latest:', JSON.stringify(sleepRes.data.data[0], null, 2));
    }
    console.log('');

    // Test 6: Manual sync
    console.log('6️⃣ Testing manual sync...');
    const syncRes = await client.post('/withings/sync');
    console.log('✅ Sync completed:', JSON.stringify(syncRes.data, null, 2));
    console.log('');

    console.log('🎉 All tests passed!');

  } catch (error) {
    console.error('❌ Error testing data endpoints:', error.response?.data || error.message);
  }
}

testWithingsIntegration();
