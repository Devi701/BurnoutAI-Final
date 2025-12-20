import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import { useUser } from '../context/UserContext';
import { fetchWeeklyReport, fetchEmployees } from '../services/api';

export default function EmployerHome() {
  const { user } = useUser();
  const [report, setReport] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [employeesError, setEmployeesError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;
    
    if (user && user.companyCode) {
      setLoading(true);
      
      // Fetch Report and Employees in parallel
      Promise.allSettled([
        fetchWeeklyReport(user.companyCode),
        fetchEmployees(user.companyCode)
      ]).then(([reportResult, employeesResult]) => {
        if (!isMounted) return;

        // Handle Report
        if (reportResult.status === 'fulfilled') {
          setReport(reportResult.value);
        } else {
          setError(reportResult.reason.message || 'Failed to load report');
        }

        // Handle Employees
        if (employeesResult.status === 'fulfilled' && Array.isArray(employeesResult.value)) {
          setEmployees(employeesResult.value);
          setEmployeesError('');
        } else if (employeesResult.status === 'rejected') {
          setEmployeesError(employeesResult.reason.message);
        }

        setLoading(false);
      });
    } else if (user) {
        setLoading(false);
    }
    
    return () => { isMounted = false; };
  }, [user]);

  const copyCode = () => {
    navigator.clipboard.writeText(user.companyCode);
    alert('Company code copied to clipboard!');
  };

  return (
    <>
      <Navbar />
      <div className="container">
        <h1>Employer Dashboard</h1>
        
        {user && (
          <div className="card" style={{marginBottom: '2rem', borderLeft: '5px solid #2563eb'}}>
            <h3>Your Company Code</h3>
            <div style={{fontSize: '3rem', fontWeight: '800', color: '#2563eb', margin: '1rem 0', display: 'flex', alignItems: 'center', gap: '1rem'}}>
              {user.companyCode}
              <button onClick={copyCode} style={{fontSize: '1rem', padding: '5px 10px', cursor: 'pointer', background: '#e0e7ff', border: 'none', borderRadius: '4px', color: '#3730a3'}}>Copy</button>
            </div>
            <p className="small">Share this code with your employees. They will need it to join your organization.</p>
          </div>
        )}

        <h2>Team Overview</h2>
        
        {loading && <div className="card"><p>Loading insights...</p></div>}
        
        {!loading && error && (
          <div className="card" style={{backgroundColor: '#fff1f2', borderColor: '#e11d48'}}>
             <h4 style={{color: '#e11d48', marginTop: 0}}>Report Unavailable</h4>
             <p>{error}</p>
             <p className="small">Reports are generated once 5 or more employees have submitted check-ins.</p>
          </div>
        )}

        {!loading && report && (
          <>
            <div className="grid" style={{gridTemplateColumns: '1fr 1fr', marginBottom: '1rem'}}>
              <div className="card">
                <h4>Active Employees</h4>
                <div className="result-score" style={{fontSize: '2.5rem'}}>{report.employeeCount || 0}</div>
              </div>
              <div className="card">
                <h4>Total Check-ins</h4>
                <div className="result-score" style={{fontSize: '2.5rem'}}>{report.totalCheckins || 0}</div>
              </div>
            </div>

            {report.teamStatus && (
               <div className="card" style={{ marginBottom: '1rem', borderLeft: `5px solid ${report.teamStatus.color}`, backgroundColor: report.teamStatus.color + '10' }}>
                  <h4 style={{color: report.teamStatus.color, marginTop: 0}}>Team Trend</h4>
                  <p style={{marginBottom: 0, fontWeight: 'bold', color: report.teamStatus.color}}>
                    {report.teamStatus.label}
                  </p>
               </div>
            )}

            {report.insight && (
               <div className="card" style={{ borderLeft: '5px solid #16a34a' }}>
                  <h4 style={{color: '#16a34a'}}>💡 Actionable Insight</h4>
                  <h5 style={{marginTop: '0.5rem', fontSize: '1.1rem'}}>{report.insight.title}</h5>
                  <p>{report.insight.suggestion}</p>
               </div>
            )}

            {report.drivers && report.drivers.teamTopFactor && (
               <div className="card" style={{ borderLeft: '5px solid #f59e0b', marginTop: '1rem', backgroundColor: '#fffbeb' }}>
                  <h4 style={{color: '#d97706', marginTop: 0}}>🔥 Primary Team Signal</h4>
                  <div style={{fontSize: '2rem', fontWeight: 'bold', margin: '0.5rem 0', color: '#92400e'}}>
                    {report.drivers.teamTopFactor.factor}
                  </div>
                  <p style={{marginBottom: 0, color: '#92400e'}}>
                    Based on aggregated check-ins, this factor appears to be the most significant contributor to team stress levels currently.
                  </p>
               </div>
            )}

            <div style={{marginTop: '2rem'}}>
              <Link to="/reports/weekly" className="quiz-button" style={{textAlign: 'center', textDecoration: 'none', display: 'inline-block', width: 'auto', padding: '12px 24px'}}>
                View Detailed Analytics & Graphs
              </Link>
            </div>
          </>
        )}

        {/* Privacy Assurance Footer */}
        <div className="card" style={{backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', marginTop: '2rem'}}>
          <h4 style={{marginTop: 0, color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
            <span>🔒</span> Privacy Assurance
          </h4>
          <p className="small" style={{marginBottom: 0, color: '#475569'}}>
            This dashboard displays aggregated data only. Individual employee check-ins and burnout scores are never revealed to you to protect their privacy and psychological safety.
          </p>
        </div>

        {/* Employee List Section - Always visible if data exists */}
        <div className="card" style={{marginTop: '2rem'}}>
            <h3>Registered Employees</h3>
            <p className="small">List of employees who have joined using your company code.</p>
            
            {employeesError && <p style={{color: 'red'}}>{employeesError}</p>}
            
            {!employeesError && employees.length === 0 ? (
                <p style={{fontStyle: 'italic', color: '#666', marginTop: '1rem'}}>No employees have joined yet.</p>
            ) : !employeesError && (
                <table style={{width: '100%', borderCollapse: 'collapse', marginTop: '1rem'}}>
                    <thead>
                        <tr style={{textAlign: 'left', borderBottom: '2px solid #eee'}}>
                            <th style={{padding: '10px'}}>Name</th>
                            <th style={{padding: '10px'}}>Email</th>
                            <th style={{padding: '10px'}}>Joined Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        {employees.map(emp => (
                            <tr key={emp.id} style={{borderBottom: '1px solid #f9f9f9'}}>
                                <td style={{padding: '10px'}}>{emp.name}</td>
                                <td style={{padding: '10px'}}>{emp.email}</td>
                                <td style={{padding: '10px'}}>{emp.createdAt ? new Date(emp.createdAt).toLocaleDateString() : 'N/A'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
      </div>
    </>
  );
}