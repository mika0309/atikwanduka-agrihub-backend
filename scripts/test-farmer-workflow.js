const http = require('http');

const BASE = { hostname: 'localhost', port: 3000, headers: { 'Content-Type': 'application/json' } };

function api(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = { ...BASE, method, path, headers: { ...BASE.headers } };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request(opts, res => {
      let resp = '';
      res.on('data', c => resp += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(resp) }); }
        catch { resolve({ status: res.statusCode, data: resp }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function test() {
  let passed = 0, failed = 0, TOKEN = '';

  console.log('\n========== FARMER WORKFLOW TEST ==========\n');

  // 1. Register
  console.log('1. REGISTER FARMER...');
  let r = await api('POST', '/api/auth/register/farmer', {
    full_name: 'Demo Farmer', phone: '0766123400',
    region: 'Mbeya', district: 'Mbeya Urban', password: 'test123'
  });
  if (r.status === 201) { console.log('   ✓ Registered (status: ' + r.status + ')'); TOKEN = r.data.token; passed++; }
  else { console.log('   ✗ FAILED: ' + JSON.stringify(r.data)); failed++; }

  // 2. Login
  console.log('\n2. LOGIN...');
  r = await api('POST', '/api/auth/login', { phone: '0766123400', password: 'test123' });
  if (r.status === 200) { console.log('   ✓ Login (status: ' + r.status + ')'); TOKEN = r.data.token; passed++; }
  else { console.log('   ✗ FAILED: ' + JSON.stringify(r.data)); failed++; }

  // 3. Profile
  console.log('\n3. GET PROFILE...');
  r = await api('GET', '/api/farmers/me', null, TOKEN);
  if (r.status === 200) { console.log('   ✓ Profile: ' + (r.data.farmer?.full_name || 'OK')); passed++; }
  else { console.log('   ✗ FAILED: ' + JSON.stringify(r.data)); failed++; }

  // 4. Add Production
  console.log('\n4. ADD PRODUCTION...');
  r = await api('POST', '/api/production/add', { crop_name: 'Maize', season: '2026A', quantity_harvested: 500, estimated_value: 250000 }, TOKEN);
  if (r.status === 201) { console.log('   ✓ Production added'); passed++; }
  else { console.log('   ✗ FAILED: ' + JSON.stringify(r.data)); failed++; }

  // 5. Get Production
  console.log('\n5. GET PRODUCTION...');
  r = await api('GET', '/api/production/my-records', null, TOKEN);
  if (r.status === 200) { console.log('   ✓ Records: ' + (r.data.count || 0)); passed++; }
  else { console.log('   ✗ FAILED: ' + JSON.stringify(r.data)); failed++; }

  // 6. Credit Score
  console.log('\n6. CREDIT SCORE...');
  r = await api('GET', '/api/credit/my-score', null, TOKEN);
  if (r.status === 200) { console.log('   ✓ Score: ' + r.data.totalScore + ' (' + r.data.rating + ')'); passed++; }
  else { console.log('   ✗ FAILED: ' + JSON.stringify(r.data)); failed++; }

  // 7. Vouchers
  console.log('\n7. SUBSIDY VOUCHERS...');
  r = await api('GET', '/api/subsidy/my-vouchers', null, TOKEN);
  if (r.status === 200) { console.log('   ✓ Vouchers: ' + (r.data.count || 0)); passed++; }
  else { console.log('   ✗ FAILED: ' + JSON.stringify(r.data)); failed++; }

  // 8. Create Listing
  console.log('\n8. CREATE LISTING...');
  r = await api('POST', '/api/market/list-produce', { crop_name: 'Fresh Maize', quantity_available: 500, price_per_unit: 1500, unit: 'kg', location: 'Mbeya' }, TOKEN);
  if (r.status === 201) { console.log('   ✓ Listing created'); passed++; }
  else { console.log('   ✗ FAILED: ' + JSON.stringify(r.data)); failed++; }

  // 9. My Listings
  console.log('\n9. MY LISTINGS...');
  r = await api('GET', '/api/market/my-listings', null, TOKEN);
  if (r.status === 200) { console.log('   ✓ Listings: ' + (r.data.count || 0)); passed++; }
  else { console.log('   ✗ FAILED: ' + JSON.stringify(r.data)); failed++; }

  // 10. Analytics
  console.log('\n10. ANALYTICS...');
  r = await api('GET', '/api/market/analytics', null, TOKEN);
  if (r.status === 200) { console.log('   ✓ Analytics fetched'); passed++; }
  else { console.log('   ✗ FAILED: ' + JSON.stringify(r.data)); failed++; }

  console.log('\n========== RESULTS ==========');
  console.log('   Passed: ' + passed + '/' + (passed + failed));
  console.log('   Failed: ' + failed + '/' + (passed + failed));
  console.log('   Workflow: ' + (failed === 0 ? '✓ ALL PASSED' : '✗ SOME FAILED'));
}

test().catch(e => console.error('Test error:', e.message));