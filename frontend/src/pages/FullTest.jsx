import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { predict } from '../services/api';
import { useUser } from '../context/UserContext';
import './SmallTest.css'; // Re-using styles

const questions = [
  // Emotional Exhaustion (Burnout)
  { id: 'EE1', text: 'I feel emotionally drained by my work.' },
  { id: 'EE2', text: 'At the end of the workday, I feel completely exhausted.' },
  { id: 'EE3', text: 'I feel burned out because of my job.' },
  { id: 'EE4', text: 'I feel frustrated by my work demands.' },
  { id: 'EE5', text: 'I feel fatigued when I think about my work.' },
  { id: 'EE6', text: 'My work leaves me feeling mentally worn out.' },
  { id: 'EE7', text: 'I feel I have little emotional energy left for work.' },
  // Stress (DASS – Stress)
  { id: 'S1', text: 'I find it difficult to relax after work.' },
  { id: 'S2', text: 'I feel tense or wound up because of my job.' },
  { id: 'S3', text: 'I feel overwhelmed by work-related responsibilities.' },
  { id: 'S4', text: 'I feel under constant pressure at work.' },
  { id: 'S5', text: 'I feel stressed even when I am not actively working.' },
  // Somatic Fatigue & Sleep Quality
  { id: 'SFQ1', text: 'I feel physically exhausted most days.' },
  { id: 'SFQ2', text: 'I experience sleep problems due to work-related stress.' },
  { id: 'SFQ3', text: 'I wake up feeling unrefreshed and tired.' },
  // Work Pressure
  { id: 'wp1', text: 'I have too much work to do in too little time.' },
  { id: 'wp2', text: 'My workload requires me to work at a very fast pace.' },
  { id: 'wp3', text: 'I feel pressured to meet tight deadlines at work.' },
  { id: 'wp4', text: 'My job demands leave me little time to recover.' },
  // Cognitive Job Demands
  { id: 'cogn1', text: 'My work requires intense concentration.' },
  { id: 'cogn2', text: 'I must constantly process complex information at work.' },
  { id: 'cogn3', text: 'My job requires sustained mental effort.' },
  { id: 'cogn4', text: 'I feel mentally overloaded by my job tasks.' },
  // Supervisor & Coworker Support
  { id: 'SS1', text: 'My supervisor provides support when I face difficulties at work.' },
  { id: 'SS2', text: 'I feel understood by my supervisor.' },
  { id: 'SS3', text: 'My supervisor cares about my well-being.' },
  { id: 'CS1', text: 'My coworkers are willing to help me when needed.' },
  { id: 'CS2', text: 'I feel supported by my colleagues at work.' },
  { id: 'CS3', text: 'I can rely on my coworkers during difficult times.' },
  // Autonomy
  { id: 'auton1', text: 'I have control over how I carry out my work tasks.' },
  { id: 'auton2', text: 'I can decide how to organize my work activities.' },
  { id: 'auton3', text: 'I feel free to make decisions related to my job.' },
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
              <li key={index}>{tip}</li>
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
      </form>
    </div>
  );
}

export default FullTest;