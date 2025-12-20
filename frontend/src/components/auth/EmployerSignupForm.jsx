import React, { useState } from 'react';
import { signupEmployer } from '../../services/api';
import { useNavigate } from 'react-router-dom';

export default function EmployerSignupForm() {
  const [name, setName] = useState('');
  const nav = useNavigate();

  async function submit(e) {
    e.preventDefault();
    try {
      const r = await signupEmployer({ name });
      alert('Company created: ' + (r.code || 'ok'));
      nav('/login');
    } catch (err) { alert(err.message); }
  }

  return (
    <form onSubmit={submit}>
      <div className="form-row"><label>Company name <input value={name} onChange={e=>setName(e.target.value)} /></label></div>
      <button type="submit">Create</button>
    </form>
  );
}