import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { usePostHog } from 'posthog-js/react';
import { AuthProvider } from './context/AuthContext';
import { UserProvider } from './context/UserContext';
import LoginPage from './pages/LoginPage';
import EmployeeHome from './pages/EmployeeHome';
import LandingPage from './pages/LandingPage';
import EmployerHome from './pages/EmployerHome';
import CheckinPage from './pages/CheckinPage';
import WeeklyReportPage from './pages/WeeklyReportPage';
import HistoryPage from './pages/HistoryPage';
import SmallTest from './pages/SmallTest'; // Assuming SmallTest component exists
import FullTest from './pages/FullTest';
import Signup from './pages/Signup';
import SignupEmployee from './pages/SignupEmployee';
import SignupEmployer from './pages/SignupEmployer';
import OnboardingPage from './pages/OnboardingPage';
import LifeSimulator from './pages/LifeSimulator';
import NotFound from './pages/NotFound';
import SettingsPage from './pages/SettingsPage';
import GamificationHub from './pages/GamificationHub';
import FeedbackPage from './pages/FeedbackPage';
import './App.css';

function PostHogPageView() {
  const location = useLocation();
  const posthog = usePostHog();
  
  useEffect(() => {
    if (posthog) {
      posthog.capture('$pageview');
    }
  }, [location, posthog]);
  
  return null;
}

function AppContent() {
  return (
    <>
      <PostHogPageView />
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/signup/employee" element={<SignupEmployee />} />
      <Route path="/signup/employer" element={<SignupEmployer />} />
      <Route path="/employee" element={<EmployeeHome />} />
      <Route path="/employer" element={<EmployerHome />} />
      <Route path="/checkin" element={<CheckinPage />} />
      <Route path="/history" element={<HistoryPage />} />
      <Route path="/small-test" element={<SmallTest />} />
      <Route path="/full-test" element={<FullTest />} />
      <Route path="/reports/weekly" element={<WeeklyReportPage />} />
      <Route path="/impact" element={<LifeSimulator />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/gamification" element={<GamificationHub />} />
      <Route path="/feedback" element={<FeedbackPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <UserProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </UserProvider>
    </AuthProvider>
  );
}