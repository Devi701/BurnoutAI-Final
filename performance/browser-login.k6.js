import http from 'k6/http';
import { browser } from 'k6/browser';
import { check, fail } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5173';
const API_BASE_URL = __ENV.API_BASE_URL || 'http://localhost:4000';
const LOGIN_EMAIL = __ENV.LOGIN_EMAIL || '';
const LOGIN_PASSWORD = __ENV.LOGIN_PASSWORD || '';

const endpointDuration = new Trend('endpoint_duration', true);
const endpointFailures = new Counter('endpoint_failures');

export const options = {
  scenarios: {
    ui: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      options: {
        browser: {
          type: 'chromium',
        },
      },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1200'],
    checks: ['rate>0.99'],
    'endpoint_duration{endpoint:login}': ['p(95)<1200'],
    'endpoint_duration{endpoint:personal_report}': ['p(95)<700'],
    endpoint_failures: ['count==0'],
  },
};

function recordEndpoint(name, res) {
  endpointDuration.add(res.timings.duration, {
    endpoint: name,
    status: String(res.status),
  });
  if (res.status >= 400) {
    endpointFailures.add(1, {
      endpoint: name,
      status: String(res.status),
      url: res.url,
    });
  }
}

export default async function () {
  if (!LOGIN_EMAIL || !LOGIN_PASSWORD) {
    fail('Set LOGIN_EMAIL and LOGIN_PASSWORD env vars.');
  }

  const loginRes = http.post(
    `${API_BASE_URL}/api/auth/login`,
    JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { endpoint: 'login' },
    }
  );
  recordEndpoint('login', loginRes);
  const loginOk = check(loginRes, {
    'login status is 200': (r) => r.status === 200,
    'login returns token': (r) => Boolean(r.json('token')),
    'login returns user id': (r) => Boolean(r.json('user.id')),
  });
  if (!loginOk) {
    fail(`Login failed (${loginRes.status}) for ${loginRes.url}`);
  }

  const token = loginRes.json('token');
  const userId = loginRes.json('user.id');

  const reportRes = http.get(`${API_BASE_URL}/api/reports/personal/me?userId=${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
    tags: { endpoint: 'personal_report' },
  });
  recordEndpoint('personal_report', reportRes);
  check(reportRes, {
    'personal report status is 200': (r) => r.status === 200,
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const loginPageRes = await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    check(loginPageRes, {
      'login page response is 2xx/3xx': (r) => {
        if (!r) return true;
        const status = r.status();
        return status >= 200 && status < 400;
      },
    });

    await page.locator('input[type="email"]').fill(LOGIN_EMAIL);
    await page.locator('input[type="password"]').fill(LOGIN_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForLoadState('networkidle');

    check(page.url(), {
      'browser login navigates away from /login': (url) => !url.includes('/login'),
    });
  } finally {
    await page.close();
    await context.close();
  }
}
