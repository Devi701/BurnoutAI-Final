import posthog from 'posthog-js';

// Configuration
const IS_PRODUCTION = import.meta.env.PROD || process.env.NODE_ENV === 'production';
const API_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY; // Align with main.jsx

export const analytics = {
  init: () => {
    if (!API_KEY) {
      console.warn('⚠️ PostHog API Key is missing. Analytics disabled.');
      return;
    }

    posthog.init(API_KEY, {
      api_host: 'https://eu.posthog.com',
      autocapture: false, // We want manual control for precision
      capture_pageview: false, // We'll track specific views manually if needed
      disable_session_recording: true, // Disable automatic session recording to reduce noise
      debug: !IS_PRODUCTION, // Log events to console in development
    });
  },

  identify: (user) => {
    if (!API_KEY) return; // Safety check
    if (!user || !user.id) return;


    // Ensure we are opted in if not internal
    if (posthog.has_opted_out_capturing()) {
      posthog.opt_in_capturing();
    }

    posthog.identify(String(user.id), {
      email: user.email,
      role: user.role, // Enum: 'employee' | 'employer'
      company_id: user.companyCode
    });

    // Register global properties for all subsequent events
    posthog.register({
      env: IS_PRODUCTION ? 'production' : 'development',
      role: user.role,
      company_id: user.companyCode
    });
  },

  capture: (eventName, properties = {}) => {
    if (!API_KEY) return; // Safety check
    if (posthog.has_opted_out_capturing()) return;

    // Enrich with timestamp and ensure numeric types where possible
    const eventProps = {
      ...properties,
      timestamp: new Date().toISOString(),
      $current_url: window.location.href
    };

    posthog.capture(eventName, eventProps);
  },

  reset: () => posthog.reset()
};