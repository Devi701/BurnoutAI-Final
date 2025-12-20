import React, { useState } from 'react';
import { signupEmployee } from '../services/api';
import { useNavigate } from 'react-router-dom';

export default function SignupEmployee() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [password, setPassword] = useState('');
  const nav = useNavigate();

  async function submit(e) {
    e.preventDefault();
    try {
      await signupEmployee({ name, email, companyCode, password });
      alert('Signed up. Please log in.');
      nav('/login');
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="container">
      <div className="card" style={{maxWidth:520, margin:'20px auto'}}>
        <h2>Employee Signup</h2>
        <form onSubmit={submit}>
          <div className="form-row"><label>Name <input value={name} onChange={e=>setName(e.target.value)} required/></label></div>
          <div className="form-row"><label>Email <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label></div>
          <div className="form-row"><label>Password <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></label></div>
          <div className="form-row"><label>Company Code <input value={companyCode} onChange={e=>setCompanyCode(e.target.value)} required/></label></div>
          <div style={{display:'flex',gap:8}}><button type="submit">Create account</button></div>
        </form>
      </div>
    </div>
  );
}