import React, { createContext, useContext, useState, useMemo } from 'react';
import PropTypes from 'prop-types';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  // Initialize state directly from localStorage
  const [token, setToken] = useState(() => localStorage.getItem('authToken'));

  const login = (newToken) => {
    localStorage.setItem('authToken', newToken);
    setToken(newToken);
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user'); // Ensure user object is also cleared
    setToken(null);
  };

  const value = useMemo(() => ({ token, login, logout }), [token]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired
};
