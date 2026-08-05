import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

const USERS_KEY = 'movieapp_users';
const SESSION_KEY = 'movieapp_session';

function getStoredUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY)) || [];
  } catch {
    return [];
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => localStorage.getItem(SESSION_KEY) || null);

  useEffect(() => {
    if (user) {
      localStorage.setItem(SESSION_KEY, user);
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  }, [user]);

  function register(username, password) {
    const users = getStoredUsers();
    const taken = users.some(
      (u) => u.username.toLowerCase() === username.toLowerCase()
    );
    if (taken) {
      return { success: false, error: 'That username is already taken.' };
    }
    const updated = [...users, { username, password }];
    localStorage.setItem(USERS_KEY, JSON.stringify(updated));
    setUser(username);
    return { success: true };
  }

  function login(username, password) {
    const users = getStoredUsers();
    const match = users.find(
      (u) =>
        u.username.toLowerCase() === username.toLowerCase() &&
        u.password === password
    );
    if (!match) {
      return { success: false, error: 'Incorrect username or password.' };
    }
    setUser(match.username);
    return { success: true };
  }

  function logout() {
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, register, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}