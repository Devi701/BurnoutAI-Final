import React, { useState, useEffect } from 'react';
import { useUser } from '../context/UserContext';

export default function PilotEnrollmentPopup() {
  const [isVisible, setIsVisible] = useState(false);
  const [step, setStep] = useState('initial'); // 'initial', 'unsure', 'no', 'thankyou'
  const [feedback, setFeedback] = useState('');
  const { user } = useUser();

  useEffect(() => {
    // Check if user has already seen/interacted with this popup
    const hasInteracted = localStorage.getItem('pilot_popup_interacted');
    if (hasInteracted) return;

    // Set timer for 90 seconds (90000 ms)
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 90000);

    return () => clearTimeout(timer);
  }, []);

  const closePopup = () => {
    setIsVisible(false);
    localStorage.setItem('pilot_popup_interacted', 'true');
  };

  const sendFeedback = async (responseType, comment = '') => {
    let API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
    // AUTO-FIX: Force production backend if on custom domain
    if (typeof globalThis.window !== 'undefined' && globalThis.window.location.hostname.includes('razoncomfort.com')) {
      API_URL = 'https://burnoutai-final.onrender.com';
    }

    try {
      await fetch(`${API_URL}/api/auth/pilot-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id,
          companyCode: user?.companyCode,
          response: responseType,
          feedback: comment
        })
      });
    } catch (e) {
      console.error("Failed to send feedback", e);
    }
  };

  const handleYes = () => {
    sendFeedback('Yes', 'Enrolled via popup');
    setStep('thankyou');
    localStorage.setItem('pilot_popup_interacted', 'true');
  };

  const handleSubmitFeedback = () => {
    sendFeedback(step === 'unsure' ? 'Unsure' : 'No', feedback);
    closePopup();
  };

  if (!isVisible) return null;

  // --- STATE: THANK YOU PAGE (Full Screen Overlay) ---
  if (step === 'thankyou') {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: '#f8fafc', zIndex: 9999,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.5s'
      }}>
        <div className="card" style={{ textAlign: 'center', padding: '3rem', maxWidth: '600px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎉</div>
          <h1 style={{ color: '#2563eb', marginTop: 0 }}>Thank You!</h1>
          <p style={{ fontSize: '1.2rem', color: '#334155', lineHeight: 1.6 }}>
            We have received your request to enrol in the free pilot. <br/>
            We will work on it within <strong>1 business day</strong>.
          </p>
          <button className="quiz-button" onClick={closePopup} style={{ marginTop: '2rem', width: 'auto', padding: '1rem 2rem' }}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // --- STATE: POPUP MODAL ---
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)',
      animation: 'fadeIn 0.3s'
    }}>
      <div className="card" style={{ width: '90%', maxWidth: '500px', padding: '2rem', position: 'relative', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
        
        {step === 'initial' && (
          <>
            <h2 style={{ marginTop: 0, color: '#1e293b' }}>Enrol in our Free Pilot?</h2>
            <p style={{ color: '#64748b', marginBottom: '2rem', fontSize: '1.05rem', lineHeight: 1.5 }}>
              Do you want to enrol your company with our free pilot program to unlock full team insights and features?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <button className="quiz-button" onClick={handleYes} style={{ fontSize: '1.1rem' }}>
                Yes, enrol me
              </button>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <button onClick={() => setStep('unsure')} style={{ padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', color: '#475569', fontWeight: 'bold' }}>
                  Unsure
                </button>
                <button onClick={() => setStep('no')} style={{ padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', color: '#475569', fontWeight: 'bold' }}>
                  No
                </button>
              </div>
              <button onClick={closePopup} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', marginTop: '0.5rem', textDecoration: 'underline' }}>
                Keep looking
              </button>
            </div>
          </>
        )}

        {step === 'unsure' && (
          <>
            <h3 style={{ marginTop: 0 }}>What feature would make you convert?</h3>
            <textarea 
              value={feedback} 
              onChange={e => setFeedback(e.target.value)}
              placeholder="Tell us what's missing..."
              style={{ width: '100%', minHeight: '100px', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', margin: '1rem 0', fontFamily: 'inherit', fontSize: '1rem' }}
            />
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="quiz-button" onClick={handleSubmitFeedback}>Submit</button>
              <button onClick={() => setStep('initial')} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>Back</button>
            </div>
          </>
        )}

        {step === 'no' && (
          <>
            <h3 style={{ marginTop: 0 }}>Why not?</h3>
            <p className="small">We appreciate your honesty. Is it timing, budget, or something else?</p>
            <textarea 
              value={feedback} 
              onChange={e => setFeedback(e.target.value)}
              placeholder="Your feedback helps us improve..."
              style={{ width: '100%', minHeight: '100px', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', margin: '1rem 0', fontFamily: 'inherit', fontSize: '1rem' }}
            />
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="quiz-button" onClick={handleSubmitFeedback}>Submit</button>
              <button onClick={() => setStep('initial')} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>Back</button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}