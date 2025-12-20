import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, recover } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useUser } from '../context/UserContext';
import '../App.css';

export default function LoginPage() {
  const [role, setRole] = useState('employee');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  
  // Recovery state
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');

  const { login: setToken } = useAuth();
  const { setUser } = useUser();
  const nav = useNavigate();

  async function handle(e) {
    e.preventDefault();
    try {
      const resp = await login({ email: identifier, password, role });
      const token = resp.token || 'demo-token';
      const userToSave = resp.user;

      // 1. Update the context state
      setToken(token);
      setUser(userToSave);

      // 2. Persist the session in localStorage
      localStorage.setItem('authToken', token);
      localStorage.setItem('user', JSON.stringify(userToSave));

      nav(role === 'employer' ? '/employer' : '/employee');
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleRecovery(e) {
    e.preventDefault();
    try {
      // Sends email to /api/auth/forgot-password
      const resp = await recover({ email: recoveryEmail });
      alert(resp.message);
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="container">
      <div className="card" style={{maxWidth:520, margin:'20px auto'}}>
        <h2>Login as {role === 'employee' ? 'Employee' : 'Employer'}</h2>
        <div style={{display:'flex', gap:10, marginBottom:20}}>
          <button type="button" onClick={()=>setRole('employee')} style={{opacity: role==='employee'?1:0.6}}>Employee</button>
          <button type="button" onClick={()=>setRole('employer')} style={{opacity: role==='employer'?1:0.6}}>Employer</button>
        </div>
        <form onSubmit={handle}>
          <div className="form-row"><label>Email Address <input type="email" value={identifier} onChange={e=>setIdentifier(e.target.value)} required/></label></div>
          <div className="form-row"><label>Password <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></label></div>
          <div style={{display:'flex',gap:8}}><button type="submit">Sign in</button></div>
        </form>

        <div style={{marginTop: 20, borderTop: '1px solid #eee', paddingTop: 10}}>
          <button 
            type="button" 
            onClick={() => setShowRecovery(!showRecovery)} 
            style={{background:'none', border:'none', color:'#2563eb', padding:0, textDecoration:'underline', fontSize:'0.9rem', cursor:'pointer'}}
          >
            {showRecovery ? 'Hide Recovery' : 'Forgot Password?'}
          </button>

          {showRecovery && (
            <form onSubmit={handleRecovery} style={{marginTop: 15, background: '#f8fafc', padding: 15, borderRadius: 8}}>
              <h4 style={{marginTop:0}}>Reset Password</h4>
              <div className="form-row"><label>Enter your registered email <input type="email" value={recoveryEmail} onChange={e=>setRecoveryEmail(e.target.value)} required /></label></div>
              <button type="submit" style={{marginTop: 10, background:'#475569'}}>Send Reset Link</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}