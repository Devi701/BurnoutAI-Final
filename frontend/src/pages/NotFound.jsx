import React from 'react';
import { Link } from 'react-router-dom';
import '../App.css';

export default function NotFound() {
  return (
    <div className="container">
      <div className="card">
        <h3>Page not found</h3>
        <p className="small">Return to <Link to="/">home</Link>.</p>
      </div>
    </div>
  );
}