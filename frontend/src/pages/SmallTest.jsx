import React, { useState } from 'react';
import { predict } from '../services/api';
import { useUser } from '../context/UserContext';
import './SmallTest.css'; // Re-using styles

const questions = [
  { id: 'emo1', text: 'I feel emotionally drained from my work.' },
  { id: 'cogn1', text: 'I have trouble concentrating when I am working.' },
  { id: 'wp1', text: 'I feel I have too much work to do.' },
  { id: 'ERI1', text: 'I receive the respect I deserve for my work and accomplishments.' },
  { id: 'auton1', text: 'I have a lot of say in what happens on my job.' },
];

const options = [
  { label: 'Strongly Disagree', value: 0 },
  { label: 'Disagree', value: 25 },
  { label: 'Neutral', value: 50 },
  { label: 'Agree', value: 75 },
  { label: 'Strongly Agree', value: 100 },
];

function SmallTest() {
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
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

    setIsLoading(true);
    try {
      // Send the correct payload structure for the 'small' test
      const payload = { type: 'small', features: answers, userId: user?.id };
      const prediction = await predict(payload);
      setResult(prediction);
    } catch (err) {
      setError(err.message || 'An error occurred while getting your score.');
    } finally {
      setIsLoading(false);
    }
  };

  if (result) {
    return (
      <div className="quiz-container">
        <h2>Your Quick Check Score</h2>
        <div className="result-score">{Math.round(result.score)}</div>
        <div className="result-tips">
          <h3>Here are some tips that might help:</h3>
          <ul>
            {result.tips.map((tip, index) => (
              <li key={index}>{tip}</li>
            ))}
          </ul>
        </div>
        <button onClick={() => { setResult(null); setAnswers({}); }} className="quiz-button">
          Take Again
        </button>
      </div>
    );
  }

  return (
    <div className="quiz-container">
      <h2>Quick Burnout Check</h2>
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
        <button type="submit" className="quiz-button" disabled={isLoading}>
          {isLoading ? 'Getting Score...' : 'Get My Score'}
        </button>
      </form>
    </div>
  );
}

export default SmallTest;