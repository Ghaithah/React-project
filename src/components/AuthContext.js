import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

const USERS_KEY = 'movieapp_users';
const SESSION_KEY = 'movieapp_session';

// Minimum characters required for a new password. This is a client-side-only
// hint, not real security (there's no backend), but it stops the most
// trivially weak accounts like a one-character password.
const MIN_PASSWORD_LENGTH = 6;

function getStoredUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY)) || [];
  } catch {
    return [];
  }
}

// Trims the username and collapses any run of internal whitespace down to a
// single space. Without this, "john doe" and "john  doe" (two spaces) are
// treated as two different, easily-confused accounts even though they're
// visually almost identical — this makes both the uniqueness check and the
// stored username consistent regardless of how much whitespace was typed.
function normalizeUsername(raw) {
  return (raw || '').trim().replace(/\s+/g, ' ');
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
    const normalizedUsername = normalizeUsername(username);

    if (!normalizedUsername) {
      return { success: false, error: 'Please enter a username.' };
    }
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return {
        success: false,
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      };
    }

    const users = getStoredUsers();
    const taken = users.some(
      (u) => u.username.toLowerCase() === normalizedUsername.toLowerCase()
    );
    if (taken) {
      return { success: false, error: 'That username is already taken.' };
    }
    const updated = [...users, { username: normalizedUsername, password }];
    localStorage.setItem(USERS_KEY, JSON.stringify(updated));
    setUser(normalizedUsername);
    return { success: true };
  }

  function login(username, password) {
    const normalizedUsername = normalizeUsername(username);
    const users = getStoredUsers();
    const match = users.find(
      (u) =>
        u.username.toLowerCase() === normalizedUsername.toLowerCase() &&
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