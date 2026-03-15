import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { useUser } from '../../context/UserContext';
import '../../App.css';

export default function Navbar({ streak }) {
  const { user } = useUser();
  const companyCode = user?.companyCode;

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/">BurnoutAI</Link>
      </div>
      <div className="navbar-meta">
        {streak > 0 && (
          <div className="pill">
            <strong>{streak}</strong> day streak
          </div>
        )}
        {companyCode && (
          <div className="pill">
            Org <strong style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace' }}>{companyCode}</strong>
          </div>
        )}
      </div>
    </nav>
  );
}

Navbar.propTypes = {
  streak: PropTypes.number
};
