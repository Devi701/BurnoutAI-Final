import http from 'k6/http';
import { check, fail } from 'k6';

const API_BASE_URL = __ENV.API_BASE_URL || 'https://burnoutai-final.onrender.com';
const LOGIN_EMAIL = __ENV.LOGIN_EMAIL || '';
const LOGIN_PASSWORD = __ENV.LOGIN_PASSWORD || '';
const COMPANY_CODE = __ENV.COMPANY_CODE || '10B196';
const TEAM_ID = __ENV.TEAM_ID || 'all';
const REQ_TIMEOUT = __ENV.REQ_TIMEOUT || '6s';

export const options = {
  scenarios: {
    focused: {
      executor: 'shared-iterations',
      vus: Number(__ENV.VUS || 5),
      iterations: Number(__ENV.ITERATIONS || 20),
      maxDuration: '5m',
    },
  },
  thresholds: {
    'http_req_failed{name:ReportsComprehensiveTeam}': ['rate<0.01'],
    'http_req_duration{name:ReportsComprehensiveTeam}': ['p(95)<900'],
    checks: ['rate>0.95'],
  },
};

function safeJson(res, path) {
  try {
    return res.json(path);
  } catch {
    return null;
  }
}

export default function (data) {
  const token = data?.token;
  if (!token) fail('No token from setup');
  const compRes = http.get(
    `${API_BASE_URL}/api/reports/comprehensive/team/${encodeURIComponent(COMPANY_CODE)}?teamId=${encodeURIComponent(TEAM_ID)}`,
    { headers: { Authorization: `Bearer ${token}` }, tags: { name: 'ReportsComprehensiveTeam' }, timeout: REQ_TIMEOUT }
  );
  check(compRes, { 'comprehensive status 200': (r) => r.status === 200 });
}

export function setup() {
  if (!LOGIN_EMAIL || !LOGIN_PASSWORD) fail('Set LOGIN_EMAIL and LOGIN_PASSWORD.');

  const loginRes = http.post(
    `${API_BASE_URL}/api/auth/login`,
    JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'AuthLoginSetup' }, timeout: REQ_TIMEOUT }
  );
  const ok = check(loginRes, { 'setup login status 200': (r) => r.status === 200 });
  if (!ok) fail(`Setup login failed with status ${loginRes.status}`);

  const token = safeJson(loginRes, 'token');
  if (!token) fail('Setup login missing token');

  const prewarmRes = http.post(
    `${API_BASE_URL}/api/reports/prewarm?companyCode=${encodeURIComponent(COMPANY_CODE)}&teamId=${encodeURIComponent(TEAM_ID)}`,
    null,
    { headers: { Authorization: `Bearer ${token}` }, tags: { name: 'ReportsPrewarmSetup' }, timeout: REQ_TIMEOUT }
  );
  if (prewarmRes.status !== 200) {
    console.log(`prewarm non-200 status=${prewarmRes.status}`);
  }

  return { token };
}
