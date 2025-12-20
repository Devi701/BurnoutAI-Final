import React, { useState } from 'react';
import { signupEmployee } from '../../services/api';
import { useNavigate } from 'react-router-dom';

export default function EmployeeSignupForm() {
  const [name, setName] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const nav = useNavigate();

  async function submit(e) {
    e.preventDefault();
    try {
      await signupEmployee({ name, companyCode });
      alert('Signed up');
      nav('/login');
    } catch (err) { alert(err.message); }
  }

  return (
    <form onSubmit={submit}>
      <div className="form-row"><label>Name <input value={name} onChange={e=>setName(e.target.value)} /></label></div>
      <div className="form-row"><label>Company Code <input value={companyCode} onChange={e=>setCompanyCode(e.target.value)} /></label></div>
      <button type="submit">Create</button>
    </form>
  );
}