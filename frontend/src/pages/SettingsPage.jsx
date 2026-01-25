import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import Navbar from '../components/layout/Navbar';
import { useUser } from '../context/UserContext';
import { useAuth } from '../context/AuthContext';
import { updateProfile, leaveCompany, regenerateCompanyCode, fetchUserCheckins, resetHistory, recover, joinCompany, deleteAccount, fetchWeeklyReport } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { analytics } from '../services/analytics';

// Helper components defined outside to prevent re-mounting on state changes (Fixes focus loss)
const Section = ({ title, children }) => (
  <div className="card" style={{ marginBottom: '2rem' }}>
    <h3 style={{ marginTop: 0, borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1rem', fontSize: '1.2rem', color: '#334155' }}>{title}</h3>
    {children}
  </div>
);

Section.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired
};

const Toggle = ({ label, checked, onChange, name }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0' }}>
    <span style={{ color: '#334155' }}>{label}</span>
    <input type="checkbox" name={name} checked={checked} onChange={onChange} style={{ transform: 'scale(1.2)', cursor: 'pointer' }} aria-label={label} />
  </div>
);

Toggle.propTypes = {
  label: PropTypes.string.isRequired,
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  name: PropTypes.string.isRequired
};

export default function SettingsPage() {
  const { user, setUser } = useUser();
  const { logout } = useAuth();
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState({ name: '', email: '', industry: 'Technology' });
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Preferences State
  const [prefs, setPrefs] = useState({
    dataProcessing: true,
    dailyReminder: true,
    weeklyReminder: true,
    riskAlerts: false,
    timezone: 'UTC',
    language: 'en'
  });

  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        name: user.name || '',
        email: user.email || '',
        industry: user.industry || 'Technology'
      }));
    }
  }, [user.id, user.name, user.email, user.industry]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');
    try {
      const res = await updateProfile({ userId: user.id, ...formData });
      setUser(prev => ({ ...prev, ...res.user }));
      setMessage('Profile updated successfully.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!user.email) return;
    setLoading(true);
    setMessage('');
    setError('');
    try {
      await recover({ email: user.email });
      setMessage(`If your email is valid, a reset link has been sent to ${user.email}.`);
    } catch (err) {
      setError('Failed to send reset link: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleLeaveOrg = async () => {
    if (!globalThis.confirm("Are you sure you want to leave this organisation? You will lose access to team insights.")) return;
    try {
      await leaveCompany({ userId: user.id });
      setUser(prev => ({ ...prev, companyCode: null }));
      alert('You have left the organisation.');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleJoinOrg = async (e) => {
    e.preventDefault();
    if (!joinCode) return;
    if (!globalThis.confirm(`Join organisation with code: ${joinCode}?`)) return;
    
    try {
      await joinCompany({ userId: user.id, companyCode: joinCode });
      setUser(prev => ({ ...prev, companyCode: joinCode.toUpperCase() }));
      setJoinCode('');
      alert('Successfully joined organisation.');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRegenerateCode = async () => {
    if (!globalThis.confirm("Regenerating the code will invalidate the old one. Continue?")) return;
    try {
      const res = await regenerateCompanyCode({ userId: user.id });
      setUser(prev => ({ ...prev, companyCode: res.companyCode }));
      alert('New company code generated.');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDownloadData = async () => {
    try {
      const data = await fetchUserCheckins(user.id);
      if (!data?.checkins?.length) return alert('No data to download.');
      
      const csvContent = "Date,Stress,Sleep,Workload,Coffee,Note\n" + 
        data.checkins.map(c => `${new Date(c.createdAt).toLocaleDateString()},${c.stress},${c.sleep},${c.workload},${c.coffee},"${c.note||''}"`).join("\n");
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `my_burnout_data_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      analytics.capture('personal_data_exported');
    } catch (err) {
      console.error(err); alert('Failed to download data.');
    }
  };

  const handleDeleteAccount = async () => {
    const confirm1 = globalThis.confirm("Are you sure you want to delete your account? This is permanent.");
    if (!confirm1) return;
    const confirm2 = globalThis.confirm("Really? All your data will be lost forever.");
    if (!confirm2) return;

    try {
      await deleteAccount(user.id);
      logout();
      navigate('/login');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDownloadTeamData = async () => {
    try {
      const report = await fetchWeeklyReport(user.companyCode);
      if (report.privacyLocked) {
        alert('Data is privacy locked (need 5+ employees).');
        return;
      }
      
      const rows = [
        ['Metric', 'Value'],
        ['Employee Count', report.employeeCount],
        ['Total Checkins', report.totalCheckins],
        ['Team Adherence', report.teamAdherence + '%'],
        ['Risk - Low', report.riskDistribution.low],
        ['Risk - Moderate', report.riskDistribution.moderate],
        ['Risk - High', report.riskDistribution.high],
        ['Risk - Critical', report.riskDistribution.critical],
        ['Top Stressor', report.drivers?.teamTopFactor?.factor || 'N/A']
      ];
      
      const csvContent = rows.map(e => e.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `team_report_${user.companyCode}.csv`;
      link.click();
      
      analytics.capture('team_metric_exported', { company_code: user.companyCode });
    } catch (err) {
      alert('Failed to download team data: ' + err.message);
    }
  };

  const handleReset = async () => {
    if (!globalThis.confirm('Are you sure you want to delete all history? This cannot be undone.')) return;
    try {
      await resetHistory(user.id);
      alert('History reset successfully. You can now start fresh.');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSavePreferences = () => {
    // In a full app, this would save to the backend
    alert('Preferences saved successfully.');
  };

  if (!user) return null;

  return (
    <>
      <Navbar />
      <div className="container" style={{ marginTop: '2rem', maxWidth: '700px' }}>
        {user.role === 'employer' && (
          <button 
            onClick={() => navigate('/employer')} 
            style={{ 
              background: 'none', 
              border: 'none', 
              color: '#64748b', 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem', 
              marginBottom: '1rem', 
              padding: 0,
              fontSize: '1rem'
            }}
          >
            ← Back to Dashboard
          </button>
        )}
        <h1 style={{ marginBottom: '2rem' }}>Settings</h1>
        
        {message && <div style={{ padding: '1rem', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '4px', marginBottom: '1rem' }}>{message}</div>}
        {error && <div style={{ padding: '1rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '4px', marginBottom: '1rem' }}>{error}</div>}

        {/* 1. Account Basics (Both Roles) */}
        <Section title="Account Basics">
          <form onSubmit={handleUpdateProfile}>
            <div className="form-row">
              <label htmlFor="name-input" style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>Full Name</label>
              <input id="name-input" name="name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="form-control" style={{ width: '100%', padding: '8px' }} />
            </div>
            <div className="form-row">
              <label htmlFor="email-input" style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>Email Address</label>
              <input id="email-input" name="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="form-control" style={{ width: '100%', padding: '8px' }} />
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button type="submit" className="quiz-button" disabled={loading} style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>Update Profile</button>
              <button type="button" onClick={handlePasswordReset} disabled={loading} style={{ background: 'none', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0.5rem 1rem', cursor: 'pointer', color: '#334155', opacity: loading ? 0.7 : 1 }}>{loading ? 'Sending...' : 'Reset Password'}</button>
            </div>
          </form>
          <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
            <button onClick={handleLogout} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Logout everywhere</button>
          </div>
        </Section>

        {/* EMPLOYEE SPECIFIC SETTINGS */}
        {user.role === 'employee' && (
          <>
            <Section title="Data & Privacy">
              <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.9rem', color: '#475569' }}>
                <strong>What your employer sees:</strong> Your employer only sees anonymised team-level trends. They cannot see your individual check-ins or risk scores.
              </div>
              <Toggle 
                label="Allow anonymised data to improve models" 
                name="dataProcessing"
                checked={prefs.dataProcessing} 
                onChange={e => {
                  const val = e.target.checked;
                  setPrefs({...prefs, dataProcessing: val});
                  analytics.capture('feature_toggled', { feature: 'data_processing', enabled: val });
                }} 
              />
              <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <button onClick={handleDownloadData} style={{ background: 'none', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.9rem', color: '#334155' }}>
                  Download personal data (CSV)
                </button>
                <button onClick={handleDeleteAccount} style={{ color: '#e11d48', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.9rem' }}>
                  Delete Account
                </button>
              </div>
            </Section>

            <Section title="Notifications">
              <Toggle 
                label="Daily check-in reminder" 
                name="dailyReminder"
                checked={prefs.dailyReminder} 
                onChange={e => {
                  const val = e.target.checked;
                  setPrefs({...prefs, dailyReminder: val});
                  analytics.capture('feature_toggled', { feature: 'daily_reminder', enabled: val });
                }} 
              />
              <Toggle 
                label="Weekly summary reminder" 
                name="weeklyReminder"
                checked={prefs.weeklyReminder} 
                onChange={e => {
                  const val = e.target.checked;
                  setPrefs({...prefs, weeklyReminder: val});
                  analytics.capture('feature_toggled', { feature: 'weekly_reminder', enabled: val });
                }} 
              />
            </Section>

            <Section title="Organisation Controls">
              {user.companyCode ? (
                <div>
                  <p style={{ margin: '0 0 1rem 0' }}>You are currently a member of organisation: <strong>{user.companyCode}</strong></p>
                  <button onClick={handleLeaveOrg} style={{ backgroundColor: '#fff1f2', color: '#e11d48', border: '1px solid #fecdd3', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}>
                    Leave Organisation
                  </button>
                  <p className="small" style={{ color: '#94a3b8', marginTop: '0.5rem' }}>Warning: You will lose access to team insights.</p>
                </div>
              ) : (
                <div>
                  <p style={{ color: '#64748b', marginBottom: '1rem' }}>You are not part of an organisation.</p>
                  <form onSubmit={handleJoinOrg} style={{ display: 'flex', gap: '0.5rem' }}>
                    <input 
                      placeholder="Enter Company Code" 
                      name="joinCode"
                      value={joinCode}
                      onChange={e => setJoinCode(e.target.value)}
                      className="form-control"
                      style={{ padding: '8px', flex: 1 }}
                    />
                    <button type="submit" className="quiz-button" style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>Join</button>
                  </form>
                </div>
              )}
            </Section>
          </>
        )}

        {/* EMPLOYER SPECIFIC SETTINGS */}
        {user.role === 'employer' && (
          <>
            <Section title="Organisation Profile">
              <p className="small" style={{ color: '#64748b', marginBottom: '1rem' }}>
                Update your organisation name and email in the <strong>Account Basics</strong> section above.
              </p>
              <div className="form-row">
                <label htmlFor="industry-select" style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>Industry Sector</label>
                <select 
                  id="industry-select"
                  name="industry"
                  className="form-control" 
                  style={{ width: '100%', padding: '8px' }}
                  value={formData.industry}
                  onChange={e => setFormData({...formData, industry: e.target.value})}
                >
                  <option value="Technology">Technology</option>
                  <option value="Healthcare">Healthcare</option>
                  <option value="Finance">Finance</option>
                  <option value="Education">Education</option>
                  <option value="Retail">Retail</option>
                  <option value="Other">Other</option>
                </select>
                <div style={{ marginTop: '0.5rem' }}>
                  <button onClick={handleUpdateProfile} className="quiz-button" style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}>Save Industry</button>
                </div>
              </div>
              <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#eff6ff', borderRadius: '4px' }}>
                <label htmlFor="company-code-display" style={{ display: 'block', marginBottom: '0.5rem', color: '#1e40af', fontWeight: 'bold' }}>Company Code</label>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <span id="company-code-display" style={{ fontSize: '1.5rem', fontFamily: 'monospace' }}>{user.companyCode}</span>
                  <button onClick={handleRegenerateCode} style={{ fontSize: '0.8rem', padding: '4px 8px', cursor: 'pointer' }}>Regenerate</button>
                </div>
              </div>
            </Section>

            <Section title="Team Access & Safety">
              <div style={{ backgroundColor: '#f0fdf4', padding: '1rem', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.9rem', color: '#166534', border: '1px solid #bbf7d0' }}>
                <strong>Privacy Guarantee:</strong> Individual employee data is never visible to you. Insights only unlock when ≥5 employees check in.
              </div>
              <Toggle 
                label="Receive alerts when team risk crosses threshold" 
                name="riskAlerts"
                checked={prefs.riskAlerts} 
                onChange={e => {
                  const val = e.target.checked;
                  setPrefs({...prefs, riskAlerts: val});
                  analytics.capture('feature_toggled', { feature: 'risk_alerts', enabled: val });
                }} 
              />
            </Section>

            <Section title="Billing & Plan">
              <p><strong>Current Plan:</strong> Pilot / Free</p>
              <p className="small" style={{ color: '#64748b' }}>Billing will only apply after explicit agreement.</p>
            </Section>

            <Section title="Data & Compliance">
              <p style={{ fontSize: '0.9rem' }}>Data is retained for 12 months by default.</p>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button onClick={handleDownloadTeamData} style={{ background: 'none', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.9rem', color: '#334155' }}>
                  Download Team Data
                </button>
                <button onClick={handleDeleteAccount} style={{ color: '#e11d48', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                  Delete Organisation
                </button>
              </div>
            </Section>
          </>
        )}

        {/* Shared Settings */}
        <Section title="Preferences">
          <div className="form-row">
            <label htmlFor="timezone-select" style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>Timezone</label>
            <select 
              id="timezone-select"
              name="timezone"
              className="form-control" 
              style={{ width: '100%', padding: '8px' }}
              value={prefs.timezone}
              onChange={e => setPrefs({...prefs, timezone: e.target.value})}
            >
              <option value="UTC">UTC (GMT+0)</option>
              <option value="EST">EST (GMT-5)</option>
              <option value="PST">PST (GMT-8)</option>
            </select>
          </div>
          <div style={{ marginTop: '1rem' }}>
            <button onClick={handleSavePreferences} className="quiz-button" style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>Save Preferences</button>
          </div>
        </Section>

        {/* Dev Only Tools */}
        {import.meta.env.DEV && (
          <div className="card" style={{ border: '1px solid #fca5a5', backgroundColor: '#fef2f2' }}>
            <h3 style={{ color: '#b91c1c', marginTop: 0 }}>Danger Zone</h3>
            <p style={{ fontSize: '0.9rem', color: '#7f1d1d', marginBottom: '1rem' }}>
              Clear all check-in data and quiz results for your account. Useful for restarting the simulation algorithm.
            </p>
            <button 
              onClick={handleReset} 
              className="quiz-button" 
              style={{ backgroundColor: '#ef4444', border: 'none' }}
            >
              Reset History
            </button>
          </div>
        )}
      </div>
    </>
  );
}