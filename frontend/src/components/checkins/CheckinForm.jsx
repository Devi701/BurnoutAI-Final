import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { submitCheckin, fetchUserCheckins } from '../../services/api';
import { useUser } from '../../context/UserContext';

const RangeInput = ({ label, name, min, max, value, leftLabel, rightLabel, color = '#2563eb', onChange }) => (
  <div style={{ marginBottom: '1.5rem' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontWeight: '500', color: '#334155' }}>
      <label>{label}</label>
      <span style={{ color: color, fontWeight: 'bold' }}>{value}</span>
    </div>
    <input 
      type="range" 
      name={name} 
      min={min} 
      max={max} 
      value={value} 
      onChange={onChange}
      style={{ width: '100%', accentColor: color, cursor: 'pointer' }} 
    />
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8' }}>
      <span>{leftLabel}</span>
      <span>{rightLabel}</span>
    </div>
  </div>
);

export default function CheckinForm() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState({
    // 1. Required Core Metrics
    energy: 50,      // 0-100
    stress: 50,      // 0-100
    
    // 2. Recovery (Optional)
    sleepHours: 7,   // 0-12
    sleepQuality: 3, // 1-5
    breaks: 0,       // Minutes
    middayEnergy: 50,// 0-100
    
    // 3. Work & Mental (Optional)
    workload: 3,     // 1-5
    anxiety: 3,      // 1-5
    engagement: 50,  // 0-100
    mood: 3,         // 1-5
    motivation: 3,   // 1-5
    
    // 4. Social & Env (Optional)
    peerSupport: 3,       // 1-5
    managementSupport: 3, // 1-5
    commuteStress: 1,     // 1-5
    
    note: ''
  });

  // Prefill optional fields from history to reduce friction
  useEffect(() => {
    if (user) {
      fetchUserCheckins(user.id)
        .then(data => {
          if (data && data.checkins && data.checkins.length > 0) {
            const last = data.checkins?.[0];
            setFormData(prev => ({
              ...prev,
              // Only prefill stable habits, reset volatile ones like Energy/Stress
              sleepHours: last.sleepHours || 7,
              workload: last.workload || 3,
              commuteStress: last.commuteStress || 1,
              managementSupport: last.managementSupport || 3,
              peerSupport: last.peerSupport || 3
            }));
          }
        })
        .catch(err => console.error("Failed to prefill checkin:", err));
    }
  }, [user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: Number(value) }));
  };

  const handleTextChange = (e) => {
    setFormData(prev => ({ ...prev, note: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await submitCheckin({
        userId: user.id,
        companyCode: user.companyCode,
        ...formData
      });
      navigate('/history');
    } catch (err) {
      alert(err.message);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* 1. REQUIRED SECTION */}
      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1.1rem', color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
          ⚡ Core Vitals (Required)
        </h3>
        
        <RangeInput label="Energy Level" name="energy" min="0" max="100" value={formData.energy} leftLabel="Exhausted" rightLabel="Fully Charged" color="#10b981" onChange={handleChange} />
        <RangeInput label="Stress Level" name="stress" min="0" max="100" value={formData.stress} leftLabel="Calm" rightLabel="Overwhelmed" color="#ef4444" onChange={handleChange} />
      </div>

      {/* TOGGLE OPTIONAL */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <button 
          type="button" 
          onClick={() => setShowOptional(!showOptional)}
          style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.9rem' }}
        >
          {showOptional ? 'Hide Detailed Metrics' : 'Show Detailed Metrics (Optional)'}
        </button>
      </div>

      {/* OPTIONAL SECTIONS */}
      {showOptional && (
        <div className="fade-in">
          {/* Recovery */}
          <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', marginBottom: '1.5rem', border: '1px solid #e2e8f0' }}>
            <h4 style={{ marginTop: 0, color: '#3b82f6' }}>🛌 Recovery</h4>
            <RangeInput label="Sleep Hours" name="sleepHours" min="0" max="12" value={formData.sleepHours} leftLabel="0 hrs" rightLabel="12+ hrs" onChange={handleChange} />
            <RangeInput label="Sleep Quality" name="sleepQuality" min="1" max="5" value={formData.sleepQuality} leftLabel="Poor" rightLabel="Excellent" onChange={handleChange} />
            <RangeInput label="Breaks (Minutes)" name="breaks" min="0" max="120" value={formData.breaks} leftLabel="None" rightLabel="2 Hours+" onChange={handleChange} />
          </div>

          {/* Work & Mental */}
          <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', marginBottom: '1.5rem', border: '1px solid #e2e8f0' }}>
            <h4 style={{ marginTop: 0, color: '#8b5cf6' }}>🧠 Work & Mind</h4>
            <RangeInput label="Workload Perception" name="workload" min="1" max="5" value={formData.workload} leftLabel="Light" rightLabel="Heavy" onChange={handleChange} />
            <RangeInput label="Anxiety / Tension" name="anxiety" min="1" max="5" value={formData.anxiety} leftLabel="None" rightLabel="High" onChange={handleChange} />
            <RangeInput label="Engagement / Focus" name="engagement" min="0" max="100" value={formData.engagement} leftLabel="Distracted" rightLabel="Flow State" onChange={handleChange} />
            <RangeInput label="Mood" name="mood" min="1" max="5" value={formData.mood} leftLabel="Low" rightLabel="High" onChange={handleChange} />
          </div>

          {/* Social & Env */}
          <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', marginBottom: '1.5rem', border: '1px solid #e2e8f0' }}>
            <h4 style={{ marginTop: 0, color: '#f59e0b' }}>🤝 Environment</h4>
            <RangeInput label="Peer Support" name="peerSupport" min="1" max="5" value={formData.peerSupport} leftLabel="Isolated" rightLabel="Supported" onChange={handleChange} />
            <RangeInput label="Management Support" name="managementSupport" min="1" max="5" value={formData.managementSupport} leftLabel="Low" rightLabel="High" onChange={handleChange} />
            <RangeInput label="Commute Stress" name="commuteStress" min="1" max="5" value={formData.commuteStress} leftLabel="None" rightLabel="High" onChange={handleChange} />
          </div>
        </div>
      )}

      {/* Note */}
      <div style={{ marginBottom: '2rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#334155' }}>Daily Note (Optional)</label>
        <textarea 
          name="note" 
          value={formData.note} 
          onChange={handleTextChange}
          placeholder="Anything specific impacting you today?"
          style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', minHeight: '80px', fontFamily: 'inherit' }}
        />
      </div>

      <button type="submit" className="quiz-button" disabled={loading} style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}>
        {loading ? 'Saving...' : 'Complete Check-in'}
      </button>
    </form>
  );
}