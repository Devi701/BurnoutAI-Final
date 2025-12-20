const BASE = import.meta.env.MODE === 'production' ? '' : 'http://localhost:4000';

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || json.message || 'API error');
  return json;
}

export function submitCheckin(payload) {
  return request('/api/checkins', { method: 'POST', body: JSON.stringify(payload) });
}

export function predict(payload) {
  return request('/api/predict', { method: 'POST', body: JSON.stringify(payload) });
}

export function signupEmployee(payload) {
  return request('/api/auth/signup/employee', { method: 'POST', body: JSON.stringify(payload) });
}

export function signupEmployer(payload) {
  return request('/api/auth/signup/employer', { method: 'POST', body: JSON.stringify(payload) });
}

export function login(payload) {
  return request('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) });
}

export function fetchWeeklyReport(companyCode) {
  return request(`/api/reports/${encodeURIComponent(companyCode)}`, { method: 'GET' });
}

export function fetchPersonalHistory(userId) {
  // The backend route uses a query param for now for simplicity
  return request(`/api/reports/personal/me?userId=${userId}`, { method: 'GET' });
}

export function recover(payload) {
  return request('/api/auth/recover', { method: 'POST', body: JSON.stringify(payload) });
}

export function fetchUserCheckins(userId) {
  return request(`/api/checkins/history/${userId}`, { method: 'GET' });
}

export function fetchEmployees(companyCode) {
  return request(`/api/auth/employees?companyCode=${encodeURIComponent(companyCode)}`, { method: 'GET' });
}