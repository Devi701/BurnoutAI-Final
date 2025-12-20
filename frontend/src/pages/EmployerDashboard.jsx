import React from 'react';
import { useUser } from '../context/UserContext';
import Navbar from '../components/layout/Navbar';

export default function EmployerDashboard() {
  const { user } = useUser();

  return (
    <>
      <Navbar />
      <div className="container" style={{ marginTop: '2rem' }}>
        <div className="card">
          <h2>Employer Dashboard</h2>
          
          <div style={{ 
            backgroundColor: '#f0f9ff', 
            border: '1px solid #bae6fd', 
            borderRadius: '8px', 
            padding: '1.5rem', 
            marginBottom: '2rem' 
          }}>
            <h3 style={{ marginTop: 0, color: '#0369a1' }}>Your Company Code</h3>
            <p style={{ fontSize: '2.5rem', fontWeight: 'bold', margin: '0.5rem 0', color: '#0c4a6e' }}>
              {user?.companyCode || 'Loading...'}
            </p>
            <p style={{ margin: 0, color: '#475569' }}>
              Share this code with your employees. They will need it to join your organization.
            </p>
          </div>
          
          <p style={{ textAlign: 'center', color: '#64748b' }}>Employee reports will appear here.</p>
        </div>
      </div>
    </>
  );
}