import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useUser } from '../../context/UserContext';
import { fetchUserCheckins } from '../../services/api';

export default function Navbar() {
  const { token, logout: authLogout } = useAuth();
  const { user, setUser } = useUser();
  const navigate = useNavigate();
  const [streak, setStreak] = useState(0);

  // A simple way to determine role for the MVP
  const isEmployer = user && user.companyCode && user.name === user.companyCode;

  useEffect(() => {
    if (user && !isEmployer) {
      fetchUserCheckins(user.id).then(data => {
        if (data.checkins) {
          const dates = new Set(data.checkins.map(c => new Date(c.createdAt).toISOString().split('T')[0]));
          const today = new Date();
          const todayStr = today.toISOString().split('T')[0];
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().split('T')[0];

          let currentStreak = 0;
          let checkDate = new Date(today);
          
          // If no checkin today, start checking from yesterday to preserve active streak
          if (!dates.has(todayStr) && dates.has(yesterdayStr)) {
            checkDate = yesterday;
          }

          while (dates.has(checkDate.toISOString().split('T')[0])) {
            currentStreak++;
            checkDate.setDate(checkDate.getDate() - 1);
          }
          setStreak(currentStreak);
        }
      }).catch(err => console.error("Failed to fetch streak", err));
    }
  }, [user, isEmployer]);

  const handleLogout = () => {
    authLogout();
    // Explicitly clear the user state from the UserContext
    setUser(null);
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">Burnout MVP</Link>
      <div>
        {token && user ? (
          <>
            {isEmployer ? (
              <Link to="/reports/weekly">Team Report</Link>
            ) : (
              <>
                <span style={{marginRight: '1rem', fontWeight: 'bold', color: '#fbbf24'}}>🔥 {streak} Day Streak</span>
                <Link to="/history">My History</Link>
              </>
            )}
            <span className="navbar-user">{user.name} <span className={isEmployer ? 'role-tag employer' : 'role-tag employee'}>{isEmployer ? 'Employer' : 'Employee'}</span></span>
            <button onClick={handleLogout} className="navbar-logout">Logout</button>
          </>
        ) : (
          <Link to="/login">Login</Link>
        )}
      </div>
    </nav>
  );
}