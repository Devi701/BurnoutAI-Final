import React, { useState } from 'react';
import { useUser } from '../context/UserContext';
import { joinCompany, leaveCompany } from '../services/api';

export default function JoinCompany() {
  const { user, setUser } = useUser();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!code) return;

    if (!user || !user.id) {
      setMessage('User not identified. Please refresh.');
      setIsError(true);
      return;
    }

    try {
      await joinCompany({ userId: user.id, companyCode: code });
      
      setMessage('Successfully joined company!');
      setIsError(false);
      // Update local user object so the form disappears
      setUser({ ...user, companyCode: code.toUpperCase() });
    } catch (err) {
      console.error('Join error:', err);
      setMessage(err.message || 'Network error.');
      setIsError(true);
    }
  };

  const handleLeave = async () => {
    if (!window.confirm('Are you sure you want to leave your current company?')) return;

    if (!user || !user.id) return;

    try {
      await leaveCompany({ userId: user.id });

      setMessage('Left company successfully.');
      setIsError(false);
      setUser({ ...user, companyCode: null });
      setCode('');
    } catch (err) {
      setMessage(err.message || 'Network error.');
      setIsError(true);
    }
  };

  // If user already has a company code, show Leave option
  if (user?.companyCode) {
    return (
      <div className="card" style={{ borderTop: '4px solid #ef4444' }}>
        <h3>Current Company</h3>
        <p style={{ marginBottom: '1rem' }}>You are linked to: <strong>{user.companyCode}</strong></p>
        <button onClick={handleLeave} className="quiz-button" style={{ width: '100%', backgroundColor: '#ef4444', border: 'none' }}>
          Leave Company
        </button>
        {message && <p style={{ color: isError ? 'red' : 'green', marginTop: '10px', fontWeight: 'bold' }}>{message}</p>}
      </div>
    );
  }

  return (
    <div className="card">
      <h3>Join a Company</h3>
      <p style={{ marginBottom: '1rem' }}>Enter your employer's code to link your account.</p>
      <form onSubmit={handleJoin} style={{ display: 'flex', gap: '10px' }}>
        <input 
          type="text" 
          value={code} 
          onChange={(e) => setCode(e.target.value)} 
          placeholder="Company Code"
          style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', flex: 1 }}
        />
        <button type="submit" className="quiz-button" style={{ width: 'auto', margin: 0 }}>Join</button>
      </form>
      {message && <p style={{ color: isError ? 'red' : 'green', marginTop: '10px', fontWeight: 'bold' }}>{message}</p>}
    </div>
  );
}