import React, { createContext, useContext, useState, useMemo } from 'react';

const UserContext = createContext();

export function UserProvider({ children }) {
  // Initialize state from localStorage, parsing the JSON string
  const [user, setUserState] = useState(() => {
    try {
      const savedUser = localStorage.getItem('user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch (error) {
      console.error(error); return null;
    }
  });

  const setUser = (newUser) => {
    localStorage.setItem('user', JSON.stringify(newUser));
    setUserState(newUser);
  };

  const value = useMemo(() => ({ user, setUser }), [user]);

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);
