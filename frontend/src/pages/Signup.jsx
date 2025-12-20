import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';

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
      // Use specific endpoints based on role
      const endpoint = formData.role === 'employer' 
        ? '/api/auth/signup/employer' 
        : '/api/auth/signup/employee';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Signup failed');
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
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>I am an:</label>
              <select name="role" value={formData.role} onChange={handleChange} className="form-control" style={{ width: '100%', padding: '8px' }}>
                <option value="employee">Employee</option>
                <option value="employer">Employer</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Full Name</label>
              <input type="text" name="name" required value={formData.name} onChange={handleChange} className="form-control" style={{ width: '100%', padding: '8px' }} />
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Email Address</label>
              <input type="email" name="email" required value={formData.email} onChange={handleChange} className="form-control" style={{ width: '100%', padding: '8px' }} />
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Password</label>
              <input type="password" name="password" required minLength="8" value={formData.password} onChange={handleChange} className="form-control" style={{ width: '100%', padding: '8px' }} />
            </div>

            {/* Only show Company Code input for Employees */}
            {formData.role === 'employee' && (
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Company Code</label>
                <input 
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