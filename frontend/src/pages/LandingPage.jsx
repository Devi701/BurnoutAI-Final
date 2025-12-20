import React from 'react';
import { Link } from 'react-router-dom';
import '../App.css';

export default function LandingPage() {
  return (
    <>
      <nav className="navbar"><div style={{fontWeight:700}}>Burnout MVP</div><div><Link to="/login">Log in</Link></div></nav>
      <div className="container">
        <div className="card">
          <h2>Welcome</h2>
          <p className="small">Daily check-ins, AI-backed burnout prediction, and employer insights.</p>
          <div style={{display:'flex', flexDirection:'column', gap:16, alignItems:'center', marginTop:'2rem'}}>
            <Link to="/onboarding" style={{width:'100%', maxWidth:'320px'}}>
              <button className="quiz-button" style={{width:'100%', padding:'18px', fontSize:'1.25rem', fontWeight:'bold'}}>Get Started</button>
            </Link>
            <Link to="/login" style={{width:'100%', maxWidth:'320px'}}>
              <button style={{width:'100%', background:'transparent', color:'#475569', border:'1px solid #cbd5e1'}}>Login</button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}