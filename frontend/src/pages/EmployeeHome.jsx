import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import { useUser } from '../context/UserContext';
import { fetchPersonalHistory } from '../services/api';

export default function EmployeeHome() {
  const { user } = useUser();
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchPersonalHistory(user.id)
        .then(data => {
          setHistory(data);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setLoading(false);
        });
    }
  }, [user]);

  // Calculations
  const riskScores = history?.datasets?.risk || [];
  const latestRisk = riskScores.length > 0 ? Math.round(riskScores[riskScores.length - 1]) : 'N/A';
  
  const last7 = riskScores.slice(-7);
  const weeklyAvg = last7.length > 0 
    ? Math.round(last7.reduce((a, b) => a + b, 0) / last7.length) 
    : 'N/A';

  const getRiskColor = (score) => {
    if (score === 'N/A') return '#64748b';
    if (score < 30) return '#10b981'; // Green
    if (score < 60) return '#f59e0b'; // Yellow/Orange
    return '#ef4444'; // Red
  };

  return (
    <>
      <Navbar />
      <div className="container">
        <h1>Welcome, {user?.name || 'Employee'}</h1>
        
        {loading && <p>Loading your wellness data...</p>}

        {!loading && (
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            
            {/* Main Column */}
            <div style={{ flex: 3, minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* 1. Burnout Risk Stats */}
              <div className="card">
                <h3>Burnout Risk Indicator</h3>
                <div style={{ display: 'flex', gap: '3rem', marginTop: '1rem' }}>
                  <div>
                    <div className="small" style={{ color: '#64748b', marginBottom: '0.5rem' }}>Today</div>
                    <div style={{ fontSize: '3rem', fontWeight: 'bold', color: getRiskColor(latestRisk) }}>
                      {latestRisk}
                    </div>
                  </div>
                  <div style={{ borderLeft: '1px solid #e2e8f0', paddingLeft: '3rem' }}>
                    <div className="small" style={{ color: '#64748b', marginBottom: '0.5rem' }}>This Week (Avg)</div>
                    <div style={{ fontSize: '3rem', fontWeight: 'bold', color: getRiskColor(weeklyAvg) }}>
                      {weeklyAvg}
                    </div>
                  </div>
                </div>
                {history?.personalStatus && (
                   <div style={{ marginTop: '1.5rem', padding: '0.75rem', backgroundColor: history.personalStatus.color + '15', border: `1px solid ${history.personalStatus.color}`, borderRadius: '8px', color: history.personalStatus.color, fontWeight: 'bold', textAlign: 'center' }}>
                     {history.personalStatus.label}
                   </div>
                )}
              </div>

              {/* 2. Top Driving Factor */}
              {history && history.topBurnoutFactor ? (
                <div className="card" style={{ borderLeft: '5px solid #ef4444', backgroundColor: '#fef2f2' }}>
                  <h3 style={{ color: '#b91c1c', marginTop: 0 }}>⚠️ Strongest Contributing Signal</h3>
                  <div style={{ fontSize: '1.8rem', fontWeight: 'bold', margin: '0.5rem 0', color: '#7f1d1d' }}>
                    {history.topBurnoutFactor.topFactor}
                  </div>
                  <p style={{ color: '#7f1d1d', margin: 0 }}>
                    In your recent check-ins, this factor appears as the most influential signal linked to elevated burnout risk. This insight strengthens as more data is collected.
                  </p>
                </div>
              ) : (
                <div className="card">
                  <h3>Contributing Signals</h3>
                  <p style={{ color: '#64748b' }}>Not enough data yet. Submit more check-ins to see data-driven insights.</p>
                </div>
              )}

              {/* 3. Actions (Check-in / Tests) */}
              <div className="card">
                <h3>Check-in & Assessments</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                  <Link to="/checkin" style={{ textDecoration: 'none' }}>
                    <button className="quiz-button" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
                      <span style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📝</span>
                      Daily Check-in
                    </button>
                  </Link>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <Link to="/small-test" style={{ textDecoration: 'none' }}>
                      <button style={{ width: '100%', padding: '1rem', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', color: '#334155', fontWeight: '600' }}>
                        Quick Check (5 Qs)
                      </button>
                    </Link>
                    <Link to="/full-test" style={{ textDecoration: 'none' }}>
                      <button style={{ width: '100%', padding: '1rem', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', color: '#334155', fontWeight: '600' }}>
                        Full Assessment (32 Qs)
                      </button>
                    </Link>
                  </div>
                </div>
              </div>

            </div>

            {/* Side Column: History */}
            <div style={{ flex: 1, minWidth: '200px' }}>
              <Link to="/history" style={{ textDecoration: 'none' }}>
                <div className="card" style={{ height: '100%', textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '200px', backgroundColor: '#f8fafc', border: '2px dashed #cbd5e1', transition: 'transform 0.2s' }}>
                  <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📊</div>
                  <h3>View History</h3>
                  <p style={{ color: '#64748b' }}>See your trends over time</p>
                </div>
              </Link>
            </div>

          </div>
        )}
      </div>
    </>
  );
}