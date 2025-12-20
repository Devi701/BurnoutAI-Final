import React from 'react';
import { Link } from 'react-router-dom'; // Assuming you use React Router
import './SmallTest.css'; // Re-using styles for consistency

function TestSelection() {
  return (
    <div className="quiz-container">
      <h2>Choose Your Assessment</h2>
      <p>
        Select an assessment to check your current burnout level. The Quick Check is fast,
        while the Full Assessment provides a more comprehensive analysis.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}>
        <Link to="/small-test" className="quiz-button" style={{ textDecoration: 'none', textAlign: 'center' }}>
          Quick Check (5 Questions)
        </Link>
        <Link to="/full-test" className="quiz-button" style={{ textDecoration: 'none', textAlign: 'center' }}>
          Full Assessment (32 Questions)
        </Link>
      </div>
    </div>
  );
}

export default TestSelection;