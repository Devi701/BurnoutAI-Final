import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { predict } from '../services/api';
import { useUser } from '../context/UserContext';
import { analytics } from '../services/analytics';
import './SmallTest.css'; // Re-using styles

const questions = [
  { id: 'boundaries_yes', text: 'I say ‘yes’ more than I should / find it hard to say ‘no’ to seniors/line managers.' },
  { id: 'social_cancel', text: 'I often cancel social events last minute due to workload.' },
  { id: 'conceal_deadlines', text: 'I sometimes conceal missed deadlines or set unrealistic deadlines.' },
  { id: 'escape_thoughts', text: 'Thoughts about escaping from work (resigning) help me cope.' },
  { id: 'distractions', text: 'I regularly use distractions to avoid completing work (daydreaming, phone checking, scrolling).' },
  { id: 'unhealthy_soothing', text: 'Concerned about self-soothing behaviours (unhealthy eating, alcohol, recreational drugs).' },
  { id: 'no_breaks', text: 'I seldom take breaks.' },
  { id: 'skip_lunch', text: 'I skip lunch or work while eating.' },
  { id: 'stimulants', text: 'I rely on caffeine or stimulants.' },
  { id: 'hard_switch_off', text: 'I find it hard to “switch off” after work.' },
  { id: 'sleep_worry', text: 'I wake during the night thinking about work.' },
];

const options = [
  { label: 'Strongly Disagree', value: 0 },
  { label: 'Disagree', value: 25 },
  { label: 'Neutral', value: 50 },
  { label: 'Agree', value: 75 },
  { label: 'Strongly Agree', value: 100 },
];

function FullTest() {
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const { user } = useUser();

  const handleAnswerChange = (questionId, value) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);

    if (Object.keys(answers).length !== questions.length) {
      setError('Please answer all questions before submitting.');
      return;
    }

    try {
      // Send the correct payload structure for the 'full' test
      const payload = { type: 'full', features: answers, userId: user?.id };
      const prediction = await predict(payload);
      setResult(prediction);

      analytics.capture('full_assessment_submitted', {
        score: prediction.score
      });
    } catch (err) {
      setError(err.message || 'An error occurred while getting your score.');
    }
  };

  // The rest of the component (rendering logic) is identical to SmallTest.jsx
  // For brevity, you can copy the return (...) block from the SmallTest component here.
  // I will include it for completeness.

  if (result) {
    return (
      <div className="quiz-container">
        <h2>Your Assessment Result</h2>
        <div className="result-score">{Math.round(result.score)}</div>
        <div className="result-tips">
          <h3>Here are some tips that might help:</h3>
          <ul>
            {result.tips.map((tip, index) => (
              <li key={`tip-${index}`}>{tip}</li>
            ))}
          </ul>
        </div>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <button onClick={() => { setResult(null); setAnswers({}); }} className="quiz-button" style={{ flex: 1 }}>
            Take Again
          </button>
          <Link to="/employee" style={{ flex: 1, textDecoration: 'none' }}>
            <button style={{ width: '100%', padding: '12px', background: '#e2e8f0', border: 'none', borderRadius: '4px', color: '#334155', fontWeight: 'bold', cursor: 'pointer' }}>Back to Home</button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="quiz-container">
      <h2>Full Burnout Assessment</h2>
      <p>Rate the following statements based on your feelings over the past few weeks.</p>
      <form onSubmit={handleSubmit}>
        {questions.map((q, index) => (
          <div key={q.id} className="question-block">
            <p className="question-text">{`${index + 1}. ${q.text}`}</p>
            <div className="options-container">
              {options.map(option => (
                <label key={option.value} className="option-label">
                  <input
                    type="radio"
                    name={q.id}
                    value={option.value}
                    checked={answers[q.id] === option.value}
                    onChange={() => handleAnswerChange(q.id, option.value)}
                    required
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
        ))}
        {error && <p className="error-message">{error}</p>}
        <button type="submit" className="quiz-button">Get My Score</button>
        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <Link to="/employee" style={{ color: '#64748b', textDecoration: 'none', fontSize: '0.9rem' }}>
            &larr; Back to Dashboard
          </Link>
        </div>
      </form>
    </div>
  );
}

export default FullTest;