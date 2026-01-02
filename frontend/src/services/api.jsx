// Use VITE_API_URL if set (Production), otherwise fallback to localhost (Dev)
let BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// Fix: Ensure protocol is present. If user entered "myapp.railway.app", force "https://myapp.railway.app"
if (!BASE.startsWith('http')) {
  BASE = `https://${BASE}`;
}
console.log('API Base URL:', BASE); 

async function request(path, opts = {}) {
  // 1. Get token from localStorage
  const token = localStorage.getItem('token');
  
  // 2. Attach Authorization header if token exists
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    headers,
    ...opts,
  });
  
  // Try to parse JSON, but fallback to text if it fails (e.g. 404/500 HTML pages)
  let json;
  try {
    json = await res.json();
  } catch (e) {
    // If JSON fails, use the status text (e.g. "Not Found", "Internal Server Error")
    throw new Error(`Server Error: ${res.status} ${res.statusText}`);
  }

  if (!res.ok) throw new Error(json.error || json.message || 'API error');
  return json;
}

export function submitCheckin(payload) {
  return request('/api/checkins', { method: 'POST', body: JSON.stringify(payload) });
}

export function predict(payload) {
  return request('/api/predict', { method: 'POST', body: JSON.stringify(payload) });
}

export async function signupEmployee(payload) {
  const res = await request('/api/auth/signup/employee', { method: 'POST', body: JSON.stringify(payload) });
  if (res.token) localStorage.setItem('token', res.token);
  return res;
}

export async function signupEmployer(payload) {
  const res = await request('/api/auth/signup/employer', { method: 'POST', body: JSON.stringify(payload) });
  if (res.token) localStorage.setItem('token', res.token);
  return res;
}

export async function login(payload) {
  const res = await request('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) });
  if (res.token) localStorage.setItem('token', res.token);
  return res;
}

export function fetchWeeklyReport(companyCode) {
  return request(`/api/reports/${encodeURIComponent(companyCode)}`, { method: 'GET' });
}

export function fetchPersonalHistory(userId, startDate, endDate) {
  let url = `/api/reports/personal/me?userId=${userId}`;
  if (startDate) url += `&startDate=${startDate}`;
  if (endDate) url += `&endDate=${endDate}`;
  return request(url, { method: 'GET' });
}

export function recover(payload) {
  return request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify(payload) });
}

export function fetchUserCheckins(userId) {
  return request(`/api/checkins/history/${userId}`, { method: 'GET' });
}

export function fetchEmployees(companyCode) {
  return request(`/api/auth/employees?companyCode=${encodeURIComponent(companyCode)}`, { method: 'GET' });
}

export function joinCompany(payload) {
  return request('/api/auth/join-company', { method: 'POST', body: JSON.stringify(payload) });
}

export function leaveCompany(payload) {
  return request('/api/auth/leave-company', { method: 'POST', body: JSON.stringify(payload) });
}

export function calculateActionImpact(payload) {
  // Defensive: Ensure actions is an array
  if (!payload.actions || !Array.isArray(payload.actions)) {
    console.warn('calculateActionImpact: actions array missing, defaulting to empty array');
    payload.actions = [];
  }
  return request('/api/action-impact', { method: 'POST', body: JSON.stringify(payload) });
}

export function saveActionPlan(payload) {
  return request('/api/action-impact/save', { method: 'POST', body: JSON.stringify(payload) });
}

export function fetchActionPlans(userId) {
  return request(`/api/action-impact/history/${userId}`, { method: 'GET' });
}

export function resetHistory(userId) {
  return request(`/api/checkins/history/${userId}`, { method: 'DELETE' });
}

export function deleteAccount(userId) {
  return request('/api/auth/me', { method: 'DELETE', body: JSON.stringify({ userId }) });
}

export function updateProfile(payload) {
  return request('/api/auth/profile', { method: 'PUT', body: JSON.stringify(payload) });
}

export function regenerateCompanyCode(payload) {
  return request('/api/auth/regenerate-code', { method: 'POST', body: JSON.stringify(payload) });
}

export function trackActionPlan(payload) {
  return request('/api/action-impact/track', { method: 'POST', body: JSON.stringify(payload) });
}

export function fetchPlanTracking(planId) {
  return request(`/api/action-impact/tracking/${planId}`, { method: 'GET' });
}

export function fetchSurveyStatus(userId) {
  return request(`/api/reports/survey/status?userId=${userId}`, { method: 'GET' });
}

export function submitSurvey(payload) {
  return request('/api/reports/survey', { method: 'POST', body: JSON.stringify(payload) });
}

export function fetchGamificationProfile(userId) {
  return request(`/api/gamification/profile/${userId}`, { method: 'GET' });
}

export function fetchLeaderboard() {
  return request('/api/gamification/leaderboard', { method: 'GET' });
}

export function updateGamificationSettings(payload) {
  return request('/api/gamification/settings', { method: 'PUT', body: JSON.stringify(payload) });
}

export function fetchChallenges(userId) {
  return request(`/api/gamification/challenges?userId=${userId}`, { method: 'GET' });
}

export function joinChallenge(payload) {
  return request('/api/gamification/challenges/join', { method: 'POST', body: JSON.stringify(payload) });
}

export function createTeam(payload) {
  return request('/api/teams', { method: 'POST', body: JSON.stringify(payload) });
}

export function fetchTeams(companyCode) {
  return request(`/api/teams?companyCode=${encodeURIComponent(companyCode)}`, { method: 'GET' });
}

export function deleteTeam(teamId) {
  return request(`/api/teams/${teamId}`, { method: 'DELETE' });
}

export function assignEmployeeToTeam(payload) {
  return request('/api/teams/assign', { method: 'POST', body: JSON.stringify(payload) });
}

export function fetchTeamMetrics(companyCode) {
  return request(`/api/reports/teams?companyCode=${encodeURIComponent(companyCode)}`, { method: 'GET' });
}

export function simulateTeamImpact(payload) {
  return request('/api/teams/simulate', { method: 'POST', body: JSON.stringify(payload) });
}