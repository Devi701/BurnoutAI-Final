import React from 'react';
import { createRoot } from 'react-dom/client';
import { PostHogProvider } from 'posthog-js/react';
import App from './App';
import './styles/variables.css';
import './App.css';
import './styles/theme.css';

// Use VITE_POSTHOG_PROJECT_API_KEY if set, otherwise fallback to the provided key
const posthogKey = import.meta.env.VITE_POSTHOG_PROJECT_API_KEY || 'phc_8UA6aYI3EpYxYjkOIzHCOjQFl8dWEMi4HP5xuobpFvv';
const posthogHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST || 'https://eu.posthog.com';

const MainApp = () => (
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

createRoot(document.getElementById('root')).render(
  posthogKey ? (
    <PostHogProvider
      apiKey={posthogKey}
      options={{
        api_host: posthogHost,
        defaults: '2025-05-24',
        capture_exceptions: true,
        debug: import.meta.env.MODE === 'development',
        capture_performance: false, // Disable Web Vitals to prevent loading errors
        capture_pageview: false, // Handled manually in App.jsx for SPA support
      }}
    >
      <MainApp />
    </PostHogProvider>
  ) : (
    <MainApp />
  )
);
