import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { signupEmployee, signupEmployer } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useUser } from '../context/UserContext';
import Navbar from '../components/layout/Navbar';

// Progress Bar Component
const ProgressBar = ({ step, totalSteps }) => (
  <div style={{ width: '100%', height: '6px', background: '#e2e8f0', position: 'fixed', top: 0, left: 0, zIndex: 1000 }}>
    <div style={{ width: `${(step / totalSteps) * 100}%`, height: '100%', background: '#2563eb', transition: 'width 0.3s ease' }}></div>
  </div>
);

ProgressBar.propTypes = {
  step: PropTypes.number.isRequired,
  totalSteps: PropTypes.number.isRequired,
};

// --- Integration Components (copied from SettingsPage for onboarding context) ---
const CalendarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="16" y1="2" x2="16" y2="6"></line>
      <line x1="8" y1="2" x2="8" y2="6"></line>
      <line x1="3" y1="10" x2="21" y2="10"></line>
  </svg>
);

const ChatIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
);

const TasksIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
);

const IntegrationItem = ({ name, slug, icon }) => {
  // Replicate API base URL logic to construct the OAuth link
  let API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
  if (typeof globalThis.window !== 'undefined' && globalThis.window.location.hostname.includes('razoncomfort.com')) {
    API_BASE_URL = 'https://burnoutai-final.onrender.com';
  }
  if (!API_BASE_URL.startsWith('http')) {
    API_BASE_URL = `https://${API_BASE_URL}`;
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: 'white' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {icon}
        <span style={{ fontWeight: 'bold', color: '#334155' }}>{name}</span>
      </div>
      <a 
        href={`${API_BASE_URL}/api/integrations/connect/${slug}`} 
        className="quiz-button" 
        style={{ textDecoration: 'none', padding: '0.5rem 1rem', fontSize: '0.9rem' }}
      >
        Connect
      </a>
    </div>
  );
};

IntegrationItem.propTypes = {
  name: PropTypes.string.isRequired,
  slug: PropTypes.string.isRequired,
  icon: PropTypes.node.isRequired,
};

export default function OnboardingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { login: setToken } = useAuth();
  const { setUser } = useUser();

  const totalSteps = 7;
  const [step, setStep] = useState(() => {
    const s = searchParams.get('step');
    return s ? parseInt(s, 10) : 1;
  });
  const [role, setRole] = useState(null); // 'employee' or 'employer'
  const [consents, setConsents] = useState({
    dataProcessing: false,
    anonymity: false
  });
  
  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    companyCode: '',
    referralCode: ''
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- 1. Smart Pre-filling from URL ---
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlEmail = params.get('email');
    const urlCode = params.get('companyCode');
    const urlRole = params.get('role');
    const urlName = params.get('name');
    const urlReferral = params.get('referralCode');

    if (urlEmail || urlCode || urlRole || urlName || urlReferral) {
      setFormData(prev => ({
        ...prev,
        email: urlEmail || prev.email,
        companyCode: urlCode || prev.companyCode,
        name: urlName || prev.name,
        referralCode: urlReferral || prev.referralCode
      }));
      
      if (urlRole === 'employee' || urlRole === 'employer') {
        setRole(urlRole);
      }
    }
  }, [location]);

  const handleNext = () => setStep(s => s + 1);
  const handleBack = () => setStep(s => s - 1);

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      let resp;
      if (role === 'employee') {
        resp = await signupEmployee(formData);
      } else {
        resp = await signupEmployer(formData);
      }

      // --- Auto-Login Logic ---
      setToken(resp.token);
      setUser(resp.user);
      localStorage.setItem('authToken', resp.token);
      localStorage.setItem('user', JSON.stringify(resp.user));

      // Move to Integrations Step for employees, or Success for employers
      if (role === 'employee') {
        setStep(5); // Google Calendar
      } else {
        setStep(7); // Employers skip integrations step
      }
    } catch (err) {
      setError(err.message);
      setIsSubmitting(false);
    }
  };

  // --- Step 1: Welcome & Tone Setting ---
  if (step === 1) {
    return (
      <>
        <ProgressBar step={step} totalSteps={totalSteps} />
        <Navbar />
        <div className="container" style={{ maxWidth: 600, marginTop: '3rem' }}>
          <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
            <h1 style={{ color: '#2563eb' }}>Your Well-being, Your Terms.</h1>
            <p style={{ fontSize: '1.1rem', color: '#475569', lineHeight: 1.6 }}>
              We believe burnout prevention starts with privacy. <br/>
              This is a safe space to track your stress, sleep, and workload.
            </p>
            <div style={{ marginTop: '2rem' }}>
              <button className="quiz-button" onClick={handleNext}>
                See How It Works
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // --- Step 2: Privacy & Consent ---
  if (step === 2) {
    const canContinue = consents.dataProcessing && consents.anonymity;
    return (
      <>
        <ProgressBar step={step} totalSteps={totalSteps} />
        <Navbar />
        <div className="container" style={{ maxWidth: 600, marginTop: '3rem' }}>
          <div className="card">
            <h2>Privacy First</h2>
            <p className="small">Before we begin, we want to be transparent about your data.</p>
            
            <div style={{ background: '#f0f9ff', padding: '1rem', borderRadius: 8, marginBottom: '1.5rem', border: '1px solid #bae6fd' }}>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#0c4a6e' }}>
                <li style={{ marginBottom: '0.5rem' }}><strong>You are in control:</strong> Participation is 100% optional. You can skip check-ins anytime.</li>
                <li style={{ marginBottom: '0.5rem' }}><strong>Private by default:</strong> Your individual scores are <em>never</em> shown to your employer.</li>
                <li><strong>Aggregate only:</strong> Employers only see team averages when 5+ employees participate.</li>
              </ul>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
              <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'start', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={consents.dataProcessing} 
                  onChange={e => setConsents({...consents, dataProcessing: e.target.checked})}
                  style={{ marginTop: 4 }}
                />
                <span style={{ fontSize: '0.95rem' }}>I consent to processing my mood data to generate personal insights.</span>
              </label>
              <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'start', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={consents.anonymity} 
                  onChange={e => setConsents({...consents, anonymity: e.target.checked})}
                  style={{ marginTop: 4 }}
                />
                <span style={{ fontSize: '0.95rem' }}>I understand my employer will only see anonymized, aggregated team reports.</span>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={handleBack} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>Back</button>
              <button className="quiz-button" disabled={!canContinue} onClick={handleNext} style={{ opacity: canContinue ? 1 : 0.5 }}>
                I Agree & Continue
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // --- Step 3: Role Selection ---
  if (step === 3) {
    return (
      <>
        <ProgressBar step={step} totalSteps={totalSteps} />
        <Navbar />
        <div className="container" style={{ maxWidth: 600, marginTop: '3rem' }}>
          <div className="card">
            <h2>How will you use the app?</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem' }}>
              <button 
                onClick={() => { setRole('employee'); handleNext(); }}
                style={{ padding: '2rem', borderRadius: 8, border: '2px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 'bold', color: '#334155' }}
              >
                I'm an Employee
                <div style={{ fontSize: '0.9rem', fontWeight: 'normal', marginTop: '0.5rem', color: '#64748b' }}>I want to track my burnout risk.</div>
              </button>
              <button 
                onClick={() => { setRole('employer'); handleNext(); }}
                style={{ padding: '2rem', borderRadius: 8, border: '2px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 'bold', color: '#334155' }}
              >
                I'm an Employer
                <div style={{ fontSize: '0.9rem', fontWeight: 'normal', marginTop: '0.5rem', color: '#64748b' }}>I want to support my team.</div>
              </button>
            </div>
            <div style={{ marginTop: '1.5rem' }}>
              <button onClick={handleBack} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>Back</button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // --- Step 3.5: Skip logic if role was pre-selected via URL ---
  if (step === 3 && role && new URLSearchParams(location.search).get('role')) {
    setStep(4); // Auto-skip to form
  }

  // --- Step 4: Profile Setup (Optional/Minimal) ---
  if (step === 4) {
    return (
    <>
      <ProgressBar step={step} totalSteps={totalSteps} />
      <Navbar />
      <div className="container" style={{ maxWidth: 500, marginTop: '3rem' }}>
        <div className="card">
          <h2>{role === 'employee' ? 'Create Your Safe Space' : 'Setup Company Space'}</h2>
          <p className="small" style={{ marginBottom: '1.5rem' }}>
            {role === 'employee' 
              ? "You can use a nickname if you prefer. Your email is only used for login recovery." 
              : "Create an account to view your team's wellness reports."}
          </p>

          {error && <div className="alert error" style={{ color: 'red', marginBottom: '1rem' }}>{error}</div>}

          <form onSubmit={handleSignup}>
            <div className="form-row">
              <label htmlFor="name-input">{role === 'employee' ? 'Display Name (or Nickname)' : 'Company Name'}</label>
              <input 
                id="name-input"
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})} 
                required 
                placeholder={role === 'employee' ? "e.g. Alex" : "e.g. Acme Corp"}
              />
            </div>
            
            <div className="form-row">
              <label htmlFor="email-input">Email Address</label>
              <input 
                id="email-input"
                type="email" 
                value={formData.email} 
                onChange={e => setFormData({...formData, email: e.target.value})} 
                required 
              />
            </div>

            <div className="form-row">
              <label htmlFor="password-input">Password</label>
              <input 
                id="password-input"
                type="password" 
                value={formData.password} 
                onChange={e => setFormData({...formData, password: e.target.value})} 
                required 
                minLength="8"
              />
            </div>

            {role === 'employee' && (
              <div className="form-row">
                <label htmlFor="code-input">Company Code <span style={{fontWeight: 'normal', color: '#64748b'}}>(Optional - join later)</span></label>
                <input 
                  id="code-input"
                  value={formData.companyCode} 
                  onChange={e => setFormData({...formData, companyCode: e.target.value})} 
                  placeholder="Enter code if you have one"
                />
              </div>
            )}

            <div className="form-row">
              <label htmlFor="referral-input">Referral Code <span style={{fontWeight: 'normal', color: '#64748b'}}>(Optional)</span></label>
              <input 
                id="referral-input"
                value={formData.referralCode} 
                onChange={e => setFormData({...formData, referralCode: e.target.value})} 
                placeholder="Enter referral code"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2rem' }}>
              <button type="button" onClick={handleBack} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>Back</button>
              <button type="submit" className="quiz-button" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Complete Setup'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
  }

  // --- Step 5: Google Calendar Integration ---
  if (step === 5) {
    // This step is only for employees. If an employer somehow lands here, skip.
    if (role !== 'employee') {
      setStep(7);
      return null;
    }

    // Construct API URL for this specific step
    let API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
    if (typeof globalThis.window !== 'undefined' && globalThis.window.location.hostname.includes('razoncomfort.com')) {
      API_BASE_URL = 'https://burnoutai-final.onrender.com';
    }
    if (!API_BASE_URL.startsWith('http')) {
      API_BASE_URL = `https://${API_BASE_URL}`;
    }
    const token = localStorage.getItem('authToken');
    const connectUrl = `${API_BASE_URL}/api/integrations/connect/google?token=${token}&redirect=/onboarding?step=6`;

    return (
      <>
        <ProgressBar step={step} totalSteps={totalSteps} />
        <Navbar />
        <div className="container" style={{ maxWidth: 600, marginTop: '3rem' }}>
          <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
            <div style={{ marginBottom: '1.5rem', color: '#2563eb' }}>
              <CalendarIcon />
            </div>
            <h2 style={{ marginBottom: '1rem' }}>Connect Google Calendar</h2>
            <p style={{ fontSize: '1.1rem', color: '#334155', marginBottom: '2rem' }}>
              Allow us to analyze your meeting load to improve burnout prediction accuracy by <strong style={{ color: '#10b981' }}>+15%</strong>.
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <a href={connectUrl} className="quiz-button" style={{ textDecoration: 'none', display: 'block' }}>
                Connect Calendar
              </a>
              <button onClick={() => setStep(6)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.9rem', textDecoration: 'underline' }}>
                Skip for now
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // --- Step 6: Slack Integration ---
  if (step === 6) {
    // Placeholder URL - assuming Slack endpoint will be added later
    // For now, "Connect" can just skip to next step or show an alert if endpoint missing
    const handleSlackConnect = () => {
      alert("Slack integration coming soon!");
      setStep(7);
    };

    return (
      <>
        <ProgressBar step={step} totalSteps={totalSteps} />
        <Navbar />
        <div className="container" style={{ maxWidth: 600, marginTop: '3rem' }}>
          <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
            <div style={{ marginBottom: '1.5rem', color: '#4a154b' }}>
              <ChatIcon />
            </div>
            <h2 style={{ marginBottom: '1rem' }}>Connect Slack</h2>
            <p style={{ fontSize: '1.1rem', color: '#334155', marginBottom: '2rem' }}>
              Analyze communication patterns and after-hours messages to boost accuracy by another <strong style={{ color: '#10b981' }}>+10%</strong>.
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <button onClick={handleSlackConnect} className="quiz-button" style={{ backgroundColor: '#4a154b' }}>
                Connect Slack
              </button>
              <button onClick={() => setStep(7)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.9rem', textDecoration: 'underline' }}>
                Skip for now
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // --- Step 7: Success & Gamification Hook ---
  if (step === 7) {
    return (
      <>
        <ProgressBar step={step} totalSteps={totalSteps} />
        <Navbar />
        <div className="container" style={{ maxWidth: 500, marginTop: '3rem', textAlign: 'center' }}>
          <div className="card" style={{ borderTop: '5px solid #10b981', animation: 'fadeIn 0.5s' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎉</div>
            <h1 style={{ color: '#059669', marginTop: 0 }}>You're In!</h1>
            <p style={{ fontSize: '1.2rem', color: '#334155' }}>
              Welcome to your new wellness journey, <strong>{formData.name}</strong>.
            </p>
            
            <div style={{ background: '#ecfdf5', padding: '1.5rem', borderRadius: '12px', margin: '2rem 0', border: '2px dashed #10b981' }}>
              <h3 style={{ margin: 0, color: '#047857' }}>+100 Score Earned</h3>
              <p style={{ margin: '0.5rem 0 0', color: '#065f46' }}>Badge Unlocked: <strong>Early Adopter</strong> 🏅</p>
            </div>

            <button 
              className="quiz-button" 
              style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}
              onClick={() => navigate(role === 'employer' ? '/employer' : '/employee')}
            >
              Go to Dashboard &rarr;
            </button>
          </div>
        </div>
      </>
    );
  }
}