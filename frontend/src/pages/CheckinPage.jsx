import React from 'react';
import CheckinForm from '../components/checkins/CheckinForm';
import '../App.css';

export default function CheckinPage() {
  return (
    <>
      <nav className="navbar"><div>Burnout MVP</div></nav>
      <div className="container">
        <div className="card">
          <h3>Submit a check-in</h3>
          <CheckinForm />
        </div>
      </div>
    </>
  );
}