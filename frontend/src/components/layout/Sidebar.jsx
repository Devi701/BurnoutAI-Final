import React from 'react';
import { Link } from 'react-router-dom';

export default function Sidebar() {
  return (
    <div style={{padding:12}}>
      <div style={{marginBottom:8}}><Link to="/employee">Home</Link></div>
      <div style={{marginBottom:8}}><Link to="/checkin">Check-in</Link></div>
      <div style={{marginBottom:8}}><Link to="/reports/weekly">Reports</Link></div>
    </div>
  );
}