import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { predict, submitCheckin } from '../../services/api';
import { useUser } from '../../context/UserContext'; // To get user info
import '../../App.css';

export default function CheckinForm() {
  const { user } = useUser(); // Get user from the correct context
  const [form, setForm] = useState({ stress: 5, sleep: 8, workload: 5, coffee: 2, note: '' });
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: name === 'note' ? value : Number(value) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);

    // Add a guard clause to ensure the user object is loaded.
    if (!user || !user.id) {
      setError("Could not identify user. Please try logging in again.");
      return;
    }

    setIsLoading(true);
    try {
      // 1. Submit the check-in data to be saved in the database
      const checkinPayload = {
        ...form,
        userId: user.id,
        companyCode: user.companyCode,
      };
      await submitCheckin(checkinPayload);

      // 2. Get a prediction based on the same data
      // Note: We need a 'daily' model for this to work. For now, we'll simulate it.
      // This part will work once a 'daily' model is trained.
      const predictionPayload = { type: 'daily', features: form, userId: user.id };
      const prediction = await predict(predictionPayload);
      setResult(prediction);

    } catch (err) {
      setError(err.message || 'An error occurred. Your check-in may not have been saved.');
    } finally {
      setIsLoading(false);
    }
  };
  
  if (result) {
    return (
      <div className="card">
        <h2>Today's Wellness Snapshot</h2>
        <div className="result-score">{Math.round(result.score)}</div>
        <div className="result-tips">
          <h3>Personalized Tips:</h3>
          <ul>
            {result.tips.map((tip, index) => (
              <li key={index}>{tip}</li>
            ))}
          </ul>
        </div>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <button onClick={() => setResult(null)} className="quiz-button" style={{ flex: 1 }}>
            Log Another Day
          </button>
          <Link to="/employee" style={{ flex: 1, textDecoration: 'none' }}>
            <button style={{ width: '100%', padding: '12px', background: '#e2e8f0', border: 'none', borderRadius: '4px', color: '#334155', fontWeight: 'bold', cursor: 'pointer' }}>Back to Home</button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card fade-in">
      <h2>Daily Check-in</h2>
      <p className="small" style={{marginBottom: '1.5rem'}}>Log your metrics for today. This data contributes to your team's anonymous weekly report.</p>
      <form onSubmit={handleSubmit}>
        <div className="form-row-slider">
          <label htmlFor="stress">Stress Level: <strong>{form.stress}</strong>/10</label>
          <input type="range" id="stress" name="stress" min="0" max="10" value={form.stress} onChange={handleChange} />
        </div>
        <div className="form-row-slider">
          <label htmlFor="sleep">Hours of Sleep: <strong>{form.sleep}</strong></label>
          <input type="range" id="sleep" name="sleep" min="0" max="12" step="0.5" value={form.sleep} onChange={handleChange} />
        </div>
        <div className="form-row-slider">
          <label htmlFor="workload">Perceived Workload: <strong>{form.workload}</strong>/10</label>
          <input type="range" id="workload" name="workload" min="0" max="10" value={form.workload} onChange={handleChange} />
        </div>
        <div className="form-row-slider">
          <label htmlFor="coffee">Cups of Coffee: <strong>{form.coffee}</strong></label>
          <input type="range" id="coffee" name="coffee" min="0" max="10" value={form.coffee} onChange={handleChange} />
        </div>

        <div className="form-row" style={{ marginTop: '1.5rem' }}>
          <label htmlFor="note" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Daily Note (Optional)</label>
          <textarea
            id="note"
            name="note"
            value={form.note}
            onChange={handleChange}
            placeholder="How was your day? Any specific stressors or wins?"
            rows="3"
            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontFamily: 'inherit' }}
          />
        </div>

        {error && <p className="error-message">{error}</p>}
        <button type="submit" className="quiz-button btn-animate" disabled={isLoading || !user} style={{marginTop: '1rem'}}>
          {isLoading ? 'Saving...' : 'Save Check-in'}
        </button>
      </form>
    </div>
  );
}
