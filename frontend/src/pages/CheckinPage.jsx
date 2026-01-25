import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import CheckinForm from '../components/checkins/CheckinForm';
import { useUser } from '../context/UserContext';
import { fetchActiveSurvey, submitSurveyResponse } from '../services/api';
import { analytics } from '../services/analytics';

const PulseSurveyForm = ({ survey }) => {
  const { user } = useUser();
  const navigate = useNavigate();
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(false);

  const handleAnswer = (qId, value) => {
    setAnswers(prev => ({ ...prev, [qId]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (Object.keys(answers).length !== survey.questions.length) {
      alert('Please answer all questions.');
      return;
    }
    setLoading(true);
    try {
      await submitSurveyResponse(survey.id, { userId: user.id, answers });
      analytics.capture('pulse_survey_completed', {
        survey_id: survey.id,
        survey_name: survey.name,
        question_count: survey.questions.length
      });
      navigate('/employee'); // Go back to dashboard after survey
    } catch (err) {
      alert(err.message);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {survey.questions.map(q => (
        <div key={q.id} style={{ marginBottom: '2rem' }}>
          <p style={{ fontWeight: 'bold', marginBottom: '1rem' }}>{q.text}</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
            {[1, 2, 3, 4, 5].map(val => (
              <button
                key={val}
                type="button"
                onClick={() => handleAnswer(q.id, val)}
                style={{
                  width: '40px', height: '40px', borderRadius: '50%',
                  border: answers[q.id] === val ? '2px solid #2563eb' : '1px solid #cbd5e1',
                  background: answers[q.id] === val ? '#eff6ff' : 'white',
                  color: answers[q.id] === val ? '#2563eb' : '#334155',
                  fontWeight: 'bold', cursor: 'pointer'
                }}
              >{val}</button>
            ))}
          </div>
        </div>
      ))}
      <button type="submit" className="quiz-button" disabled={loading} style={{ width: '100%', marginTop: '1rem' }}>
        {loading ? 'Submitting...' : 'Submit Survey'}
      </button>
    </form>
  );
};

PulseSurveyForm.propTypes = {
  survey: PropTypes.shape({
    id: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
    questions: PropTypes.arrayOf(PropTypes.shape({
      id: PropTypes.string.isRequired,
      text: PropTypes.string.isRequired
    })).isRequired
  }).isRequired
};

export default function CheckinPage() {
  const { user } = useUser();
  const [activeSurvey, setActiveSurvey] = useState(null);
  const [surveyLoading, setSurveyLoading] = useState(true);

  useEffect(() => {
    if (user?.companyCode) {
      fetchActiveSurvey(user.companyCode)
        .then(survey => setActiveSurvey(survey))
        .catch(() => setActiveSurvey(null))
        .finally(() => setSurveyLoading(false));
    } else {
      setSurveyLoading(false);
    }
  }, [user]);

  return (
    <>
      <Navbar />
      <div className="container" style={{ marginTop: '2rem', paddingBottom: '4rem' }}>
        <div className="card">
          {surveyLoading ? <p>Loading...</p> : activeSurvey ? (
            <>
              <h2 style={{ marginBottom: '0.5rem' }}>Pulse Survey: {activeSurvey.name}</h2>
              <p style={{ color: '#64748b', marginBottom: '2rem' }}>Your employer has requested feedback. Please rate the following from 1 (Strongly Disagree) to 5 (Strongly Agree).</p>
              <PulseSurveyForm survey={activeSurvey} />
            </>
          ) : (
            <>
              <h2 style={{ marginBottom: '0.5rem' }}>Daily Check-in</h2>
              <p style={{ color: '#64748b', marginBottom: '2rem' }}>Track your vitals to prevent burnout.</p>
              <CheckinForm />
            </>
          )}
        </div>
      </div>
    </>
  );
}