import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import { signupEmployee, signupEmployer } from '../services/api';

export default function Signup() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'employee',
    companyCode: ''
  });
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      if (formData.role === 'employer') {
        // Exclude companyCode for employer signup
        const { companyCode, ...employerData } = formData;
        await signupEmployer(employerData);
      } else {
        // Employee signup
        await signupEmployee(formData);
      }

      // Redirect to login after successful signup
      navigate('/login');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <Navbar />
      <div className="container" style={{ maxWidth: '500px', marginTop: '2rem' }}>
        <div className="card">
          <h2>Create Account</h2>
          {error && <div className="alert error" style={{ color: 'red', marginBottom: '1rem' }}>{error}</div>}
          
          <form onSubmit={handleSubmit}>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label htmlFor="role-select" style={{ display: 'block', marginBottom: '0.5rem' }}>I am an:</label>
              <select id="role-select" name="role" value={formData.role} onChange={handleChange} className="form-control" style={{ width: '100%', padding: '8px' }}>
                <option value="employee">Employee</option>
                <option value="employer">Employer</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label htmlFor="name-input" style={{ display: 'block', marginBottom: '0.5rem' }}>Full Name</label>
              <input id="name-input" type="text" name="name" required value={formData.name} onChange={handleChange} className="form-control" style={{ width: '100%', padding: '8px' }} />
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label htmlFor="email-input" style={{ display: 'block', marginBottom: '0.5rem' }}>Email Address</label>
              <input id="email-input" type="email" name="email" required value={formData.email} onChange={handleChange} className="form-control" style={{ width: '100%', padding: '8px' }} />
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label htmlFor="password-input" style={{ display: 'block', marginBottom: '0.5rem' }}>Password</label>
              <input id="password-input" type="password" name="password" required minLength="8" value={formData.password} onChange={handleChange} className="form-control" style={{ width: '100%', padding: '8px' }} />
            </div>

            {/* Only show Company Code input for Employees */}
            {formData.role === 'employee' && (
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label htmlFor="code-input" style={{ display: 'block', marginBottom: '0.5rem' }}>Company Code</label>
                <input 
                  id="code-input"
                  type="text" 
                  name="companyCode" 
                  required 
                  placeholder="Enter code provided by your employer"
                  value={formData.companyCode} 
                  onChange={handleChange} 
                  className="form-control" 
                  style={{ width: '100%', padding: '8px' }}
                />
              </div>
            )}

            <button type="submit" className="quiz-button" style={{ width: '100%', marginTop: '1rem' }}>Sign Up</button>
          </form>
          <p style={{ marginTop: '1rem', textAlign: 'center' }}>
            Already have an account? <Link to="/login">Log In</Link>
          </p>
        </div>
      </div>
    </>
  );
}