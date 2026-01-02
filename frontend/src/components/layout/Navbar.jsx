import React from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '../../context/UserContext';
import '../../App.css';

export default function Navbar({ streak }) {
  const { user } = useUser();
  const companyCode = user?.companyCode;

  return (
    <nav className="navbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>
        <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>Burnout MVP</Link>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
      {streak > 0 && (
        <div style={{ fontSize: '0.9rem', color: '#d97706', backgroundColor: '#fffbeb', padding: '4px 12px', borderRadius: '20px', border: '1px solid #fcd34d', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>🔥</span> <span style={{ fontWeight: 'bold' }}>{streak}</span>
        </div>
      )}
      {companyCode && (
        <div style={{ fontSize: '0.9rem', color: '#64748b', backgroundColor: '#f1f5f9', padding: '4px 12px', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
          Org: <span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#334155' }}>{companyCode}</span>
        </div>
      )}
      </div>
    </nav>
  );
}