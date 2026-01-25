import React, { useState } from 'react';
import PropTypes from 'prop-types';

export default function ShareReferral({ referralCode, scoreReward = 500 }) {
  const [copied, setCopied] = useState(false);
  
  // Generate the full URL with the referral code parameter
  const referralLink = `${globalThis.location.origin}/onboarding?referralCode=${referralCode || ''}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join BurnoutAI',
          text: `Join me on BurnoutAI to track wellness! Use my referral code: ${referralCode}`,
          url: referralLink,
        });
      } catch (err) {
        console.error('Share failed:', err);
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>🎁 Invite & Earn</h3>
      <p style={{ color: '#64748b' }}>
        Invite coworkers to join your wellness journey. You both get <strong>{scoreReward} Score</strong>!
      </p>
      
      <div style={{ 
        background: '#f1f5f9', 
        padding: '1rem', 
        borderRadius: '8px', 
        marginTop: '1rem' 
      }}>
        <label htmlFor="referral-link" style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '0.5rem' }}>
          Your Referral Link
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input 
            id="referral-link"
            readOnly 
            value={referralLink} 
            style={{ 
              flex: 1, 
              padding: '8px', 
              borderRadius: '4px', 
              border: '1px solid #cbd5e1',
              color: '#334155',
              fontSize: '0.9rem',
              background: 'white'
            }} 
            onClick={(e) => e.target.select()}
          />
          <button 
            onClick={handleCopyLink} 
            className="quiz-button" 
            style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.9rem', whiteSpace: 'nowrap' }}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
      
      <div style={{ marginTop: '1rem' }}>
        <button 
          className="quiz-button" 
          style={{ width: '100%', background: '#0ea5e9' }} 
          onClick={handleNativeShare}
        >
          Share Link
        </button>
      </div>
    </div>
  );
}

ShareReferral.propTypes = {
  referralCode: PropTypes.string,
  scoreReward: PropTypes.number
};