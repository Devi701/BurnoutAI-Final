import React, { useState } from 'react';
import { signupEmployer } from '../services/api';
import { useNavigate } from 'react-router-dom';

export default function SignupEmployer() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const nav = useNavigate();

  async function submit(e) {
    e.preventDefault();
    try {
      const resp = await signupEmployer({ name, email, password });
      alert('Employer created. Company code: ' + (resp.companyCode || 'created'));
      nav('/login');
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="container">
      <div className="card" style={{maxWidth:520, margin:'20px auto'}}>
        <h2>Employer Signup</h2>
        <form onSubmit={submit}>
          <div className="form-row"><label>Company Name <input value={name} onChange={e=>setName(e.target.value)} required/></label></div>
          <div className="form-row"><label>Email <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label></div>
          <div className="form-row"><label>Password <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength="8"/></label></div>
          <div style={{display:'flex',gap:8}}><button type="submit">Create company</button></div>
        </form>
      </div>
    </div>
  );
}