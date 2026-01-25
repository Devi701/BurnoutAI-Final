import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';

export default function FeedbackPage() {
  const [feedback, setFeedback] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!feedback.trim()) return;
    
    // Open email client with feedback pre-filled
    const subject = encodeURIComponent('BurnoutAI Feedback');
    const body = encodeURIComponent(feedback);
    window.location.href = `mailto:maheshwariv919@gmail.com?subject=${subject}&body=${body}`;
    
    setSubmitted(true);
  };

  return (
    <>
      <Navbar />
      <div className="container" style={{ marginTop: '4rem', maxWidth: '600px' }}>
        <div className="card">
          <h2 style={{ marginBottom: '1rem' }}>We value your feedback</h2>
          
          {submitted ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
              <h3>Opening Email Client...</h3>
              <p style={{ color: '#64748b' }}>Please click <strong>Send</strong> in your email app to complete the submission.</p>
              <Link to="/" className="quiz-button" style={{ display: 'inline-block', marginTop: '1rem', textDecoration: 'none', width: 'auto', padding: '0.8rem 2rem' }}>Return Home</Link>
              <button onClick={() => setSubmitted(false)} style={{ display: 'block', margin: '1rem auto', background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }}>Edit Feedback</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>Let us know what you think about BurnoutAI or how we can improve.</p>
              
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Type your feedback here..."
                style={{ 
                  width: '100%', 
                  minHeight: '150px', 
                  padding: '1rem', 
                  borderRadius: '8px', 
                  border: '1px solid #cbd5e1',
                  marginBottom: '1.5rem',
                  fontFamily: 'inherit',
                  resize: 'vertical'
                }}
                required
              />
              
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <button type="submit" className="quiz-button" style={{ width: 'auto', padding: '0.8rem 2rem' }}>
                  Submit Feedback
                </button>
                <Link to="/" style={{ color: '#64748b', textDecoration: 'none' }}>Cancel</Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}