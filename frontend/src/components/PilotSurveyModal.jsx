import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { submitSurvey } from '../services/api';
import { analytics } from '../services/analytics';

export default function PilotSurveyModal({ userId, companyCode, activeDays, onClose }) {
  const [step, setStep] = useState(0); // 0: Form, 1: Thank You
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    daysUsed: '3 days',
    featuresUsed: [],
    clarityScore: 3,
    awareness: 'Somewhat',
    behaviorChange: 'Planning to',
    behaviorChangeText: '',
    safety: 'Mostly',
    continuedAccess: 'Maybe',
    mustHave: ''
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleMultiSelect = (feature) => {
    setFormData(prev => {
      const current = prev.featuresUsed;
      if (current.includes(feature)) {
        return { ...prev, featuresUsed: current.filter(f => f !== feature) };
      }
      return { ...prev, featuresUsed: [...current, feature] };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await submitSurvey({
        userId,
        companyCode,
        activeDays,
        ...formData
      });

      // Analytics
      analytics.capture('pilot_survey_submitted', {
        days_active: activeDays,
        company_id: companyCode,
        behaviour_changed: formData.behaviorChange
      });

      setStep(1);
      setTimeout(() => {
        onClose();
      }, 2500);
    } catch (err) {
      console.error(err);
      alert('Failed to submit survey. Please try again.');
      setLoading(false);
    }
  };

  const handleDismiss = async () => {
    if (globalThis.confirm("Dismiss this survey? It won't appear again.")) {
      try {
        await submitSurvey({ userId, dismissed: true });
        onClose();
      } catch (e) { console.error(e); onClose(); }
    }
  };

  if (step === 1) {
    return (
      <div style={overlayStyle}>
        <div style={modalStyle}>
          <h2 style={{ color: '#10b981', textAlign: 'center' }}>Thank You!</h2>
          <p style={{ textAlign: 'center', color: '#64748b' }}>Your feedback helps us improve BurnoutAI.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Pilot Feedback</h3>
          <button onClick={handleDismiss} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}>&times;</button>
        </div>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '70vh', overflowY: 'auto', paddingRight: '5px' }}>
          
          <Label>How many days did you actively use BurnoutAI?</Label>
          <Select value={formData.daysUsed} onChange={e => handleChange('daysUsed', e.target.value)} options={['3 days', '4–5 days', '6–7 days', 'More than 7 days']} />

          <Label>Which features did you use?</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {['Daily check-ins', 'Burnout risk dashboard', 'Action plan simulator', 'History / trends'].map(f => (
              <button 
                key={f} 
                type="button"
                onClick={() => handleMultiSelect(f)}
                style={{ 
                  padding: '6px 12px', 
                  borderRadius: '16px', 
                  border: '1px solid',
                  borderColor: formData.featuresUsed.includes(f) ? '#2563eb' : '#cbd5e1',
                  backgroundColor: formData.featuresUsed.includes(f) ? '#eff6ff' : 'white',
                  color: formData.featuresUsed.includes(f) ? '#2563eb' : '#64748b',
                  cursor: 'pointer', fontSize: '0.85rem'
                }}
              >
                {f}
              </button>
            ))}
          </div>

          <Label>After using BurnoutAI, how clear is your understanding of your burnout risk? (1-5)</Label>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            {[1, 2, 3, 4, 5].map(num => (
              <label key={num} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '0.8rem' }}>
                <input type="radio" name="clarity" checked={formData.clarityScore === num} onChange={() => handleChange('clarityScore', num)} />
                {num}
              </label>
            ))}
          </div>

          <Label>Did BurnoutAI highlight something you weren’t previously aware of?</Label>
          <Select value={formData.awareness} onChange={e => handleChange('awareness', e.target.value)} options={['Yes', 'Somewhat', 'No']} />

          <Label>Did you change any behaviour because of BurnoutAI?</Label>
          <Select value={formData.behaviorChange} onChange={e => handleChange('behaviorChange', e.target.value)} options={['Yes', 'Planning to', 'No']} />

          {formData.behaviorChange === 'Yes' && (
            <input 
              placeholder="What did you change? (Optional)" 
              name="behaviorChangeText"
              value={formData.behaviorChangeText} 
              onChange={e => handleChange('behaviorChangeText', e.target.value)}
              style={inputStyle}
            />
          )}

          <Label>Did you feel safe and not monitored while using the app?</Label>
          <Select value={formData.safety} onChange={e => handleChange('safety', e.target.value)} options={['Yes', 'Mostly', 'No']} />

          <Label>Would you want continued access if this became a full product?</Label>
          <Select value={formData.continuedAccess} onChange={e => handleChange('continuedAccess', e.target.value)} options={['Yes', 'Maybe', 'No']} />

          <Label>What is the ONE thing that would make this a must-have for you?</Label>
          <textarea 
            name="mustHave"
            value={formData.mustHave} 
            onChange={e => handleChange('mustHave', e.target.value)}
            style={{ ...inputStyle, minHeight: '60px' }}
          />

          <button type="submit" className="quiz-button" disabled={loading} style={{ marginTop: '0.5rem' }}>
            {loading ? 'Submitting...' : 'Submit Feedback'}
          </button>
        </form>
      </div>
    </div>
  );
}

const Label = ({ children }) => <label style={{ fontSize: '0.9rem', fontWeight: '600', color: '#334155', marginBottom: '-0.5rem' }}>{children}</label>;

const Select = ({ value, onChange, options }) => (
  <select value={value} onChange={onChange} style={inputStyle}>
    {options.map(o => <option key={o} value={o}>{o}</option>)}
  </select>
);

Label.propTypes = { children: PropTypes.node.isRequired };
Select.propTypes = { value: PropTypes.string.isRequired, onChange: PropTypes.func.isRequired, options: PropTypes.array.isRequired };

const inputStyle = {
  padding: '8px',
  borderRadius: '4px',
  border: '1px solid #cbd5e1',
  width: '100%',
  fontSize: '0.9rem'
};

const overlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
};

const modalStyle = {
  backgroundColor: 'white', padding: '2rem', borderRadius: '8px', width: '90%', maxWidth: '500px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
};

PilotSurveyModal.propTypes = {
  userId: PropTypes.number.isRequired,
  companyCode: PropTypes.string,
  activeDays: PropTypes.number.isRequired,
  onClose: PropTypes.func.isRequired
};