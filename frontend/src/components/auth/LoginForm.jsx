import React, { useState } from 'react';
import { login as apiLogin } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useUser } from '../../context/UserContext';
import { useNavigate } from 'react-router-dom';

export default function LoginForm() {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const { login } = useAuth();
  const { setUser } = useUser();
  const nav = useNavigate();

  async function handle(e) {
    e.preventDefault();
    try {
      const resp = await apiLogin({ identifier: id, password: pw });
      login(resp.token || 'demo-token');
      setUser(resp.user || { id: 1, name: 'Demo' });
      nav('/employee');
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <form onSubmit={handle}>
      <div className="form-row"><label>Identifier <input value={id} onChange={e=>setId(e.target.value)} required /></label></div>
      <div className="form-row"><label>Password <input type="password" value={pw} onChange={e=>setPw(e.target.value)} required /></label></div>
      <div style={{display:'flex', gap:8}}><button type="submit">Login</button></div>
    </form>
  );
}