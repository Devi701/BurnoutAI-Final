import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import './SettingsPage.css';

const INTEGRATION_META = {
  slack: {
    label: 'Slack',
    description: 'Track collaboration load and message activity.',
    badge: 'S',
    color: '#4A154B'
  },
  trello: {
    label: 'Trello',
    description: 'Sync project boards and work-in-progress signals.',
    badge: 'T',
    color: '#0079BF'
  },
  jira: {
    label: 'Jira',
    description: 'Connect ticket flow to workload insights.',
    badge: 'J',
    color: '#0052CC'
  },
  asana: {
    label: 'Asana',
    description: 'Map task pacing and assignment pressure.',
    badge: 'A',
    color: '#F06A6A'
  },
  google: {
    label: 'Google Calendar',
    description: 'Capture meeting density and focus time patterns.',
    badge: 'G',
    color: '#4285F4'
  }
};

const SettingsPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // Gracefully handle missing context for preview/test environments
  let user = { name: '', email: '', companyCode: '' };
  try {
    const ctx = useUser();
    if (ctx && ctx.user) user = ctx.user;
  } catch (e) {
    // Context not found or not wrapped
  }

  const [integrations, setIntegrations] = useState({
    slack: false,
    trello: false,
    jira: false,
    asana: false,
    google: false
  });

  const [formData, setFormData] = useState({
    name: user.name || '',
    email: user.email || '',
    companyCode: user.companyCode || ''
  });

  useEffect(() => {
    setFormData({
      name: user.name || '',
      email: user.email || '',
      companyCode: user.companyCode || ''
    });
  }, [user.name, user.email, user.companyCode]);

  useEffect(() => {
    const successService = searchParams.get('integration_success');
    if (successService && Object.keys(INTEGRATION_META).includes(successService)) {
      setIntegrations(prev => ({ ...prev, [successService]: true }));
      // Clean URL
      navigate('/settings', { replace: true });
    }
  }, [searchParams, navigate]);

  const handleConnect = (service) => {
    // Use the backend route to initiate OAuth
    let API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
    if (typeof globalThis.window !== 'undefined' && globalThis.window.location.hostname.includes('razoncomfort.com')) {
      API_BASE_URL = 'https://burnoutai-final.onrender.com';
    }
    if (!API_BASE_URL.startsWith('http')) {
      API_BASE_URL = `https://${API_BASE_URL}`;
    }
    const token = localStorage.getItem('token');

    if (service === 'google') {
      window.location.href = `${API_BASE_URL}/api/integrations/google/auth?token=${token}`;
      return;
    }

    if (service === 'slack') {
      window.location.href = `${API_BASE_URL}/api/integrations/slack/auth?token=${token}`;
      return;
    }

    if (service === 'trello') {
      window.location.href = `${API_BASE_URL}/api/integrations/trello/auth?token=${token}`;
      return;
    }

    window.location.href = `${API_BASE_URL}/api/integrations/connect/${service}?token=${token}&redirect=/settings?integration_success=${service}`;
  };

  const handleDisconnect = (service) => {
    if (window.confirm(`Disconnect ${service}?`)) {
      setIntegrations(prev => ({ ...prev, [service]: false }));
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login', { replace: true });
  };

  const handleDeleteAccount = () => {
    const confirmation = window.prompt('Type "DELETE" to confirm account deletion.');
    if (confirmation === 'DELETE') {
      navigate('/signup', { replace: true });
    }
  };

  const roleLabel = user.role === 'employer' ? 'Employer' : 'Employee';
  const roleDescription = user.role === 'employer'
    ? 'Manage company account details and organization integrations.'
    : 'Manage your personal account details and connected tools.';

  return (
    <main className="settings-page">
      <section className="settings-shell">
        <header className="settings-header">
          <div>
            <p className="settings-kicker">Account Settings</p>
            <h1>Simple, focused controls</h1>
            <p>{roleDescription}</p>
          </div>
          <div className="settings-header-actions">
            <span className={`settings-role-tag ${user.role === 'employer' ? 'employer' : 'employee'}`}>
              {roleLabel}
            </span>
            <button onClick={handleLogout} className="settings-btn settings-btn-ghost">
              Sign Out
            </button>
          </div>
        </header>

        <section className="settings-card">
          <div className="settings-card-title">
            <h2>Profile</h2>
            <p>Keep your account information up to date.</p>
          </div>
          <div className="settings-form-grid">
            <label className="settings-field">
              <span>Full Name</span>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </label>
            <label className="settings-field">
              <span>Email</span>
              <input type="email" value={formData.email} disabled />
            </label>
            <label className="settings-field settings-field-wide">
              <span>{user.role === 'employer' ? 'Company Access Code' : 'Linked Company Code'}</span>
              <input type="text" value={formData.companyCode} readOnly />
            </label>
          </div>
          <div className="settings-actions">
            <button className="settings-btn settings-btn-primary">Save Changes</button>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-title">
            <h2>Connected Apps</h2>
            <p>Enable integrations to improve context for burnout insights.</p>
          </div>

          <div className="settings-integrations">
            {Object.keys(integrations).map((service) => {
              const meta = INTEGRATION_META[service];
              return (
                <div key={service} className="settings-integration-row">
                  <div className="settings-integration-main">
                    <span
                      className="settings-integration-badge"
                      style={{ backgroundColor: meta.color }}
                    >
                      {meta.badge}
                    </span>
                    <div>
                      <h3>{meta.label}</h3>
                      <p>{meta.description}</p>
                    </div>
                  </div>

                  <div className="settings-integration-actions">
                    {integrations[service] ? (
                      <>
                        <span className="settings-connected-pill">Connected</span>
                        <button
                          onClick={() => handleDisconnect(service)}
                          className="settings-btn settings-btn-link danger"
                        >
                          Disconnect
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleConnect(service)}
                        className="settings-btn settings-btn-ghost"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="settings-card settings-card-danger">
          <div className="settings-card-title">
            <h2>Danger Zone</h2>
            <p>Irreversible actions are isolated here for safety.</p>
          </div>
          <div className="settings-danger-row">
            <div>
              <h3>Delete Account</h3>
              <p>Remove your account and linked data permanently.</p>
            </div>
            <button onClick={handleDeleteAccount} className="settings-btn settings-btn-danger">
              Delete Account
            </button>
          </div>
        </section>
      </section>
    </main>
  );
};

export default SettingsPage;
