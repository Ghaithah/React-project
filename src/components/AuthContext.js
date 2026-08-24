import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

const USERS_KEY = 'movieapp_users';
const SESSION_KEY = 'movieapp_session';

// Minimum characters required for a new password. This is a client-side-only
// hint, not real security (there's no backend), but it stops the most
// trivially weak accounts like a one-character password.
const MIN_PASSWORD_LENGTH = 6;

// Deliberately simple (not RFC 5322-complete) — just enough to catch
// "forgot the @" / "forgot the domain" typos without rejecting real
// addresses with unusual-but-valid local parts.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getStoredUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY)) || [];
  } catch {
    return [];
  }
}

// Trims and lowercases the email so "Jane@Example.com" and
// "jane@example.com" are treated as the same account, both for the
// uniqueness check at registration and for matching a login attempt.
function normalizeEmail(raw) {
  return (raw || '').trim().toLowerCase();
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

  function register(email, password) {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !EMAIL_PATTERN.test(normalizedEmail)) {
      return { success: false, error: 'Please enter a valid email address.' };
    }
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return {
        success: false,
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      };
    }

    const users = getStoredUsers();
    const taken = users.some((u) => u.email === normalizedEmail);
    if (taken) {
      return { success: false, error: 'An account with that email already exists.' };
    }
    const updated = [...users, { email: normalizedEmail, password }];
    localStorage.setItem(USERS_KEY, JSON.stringify(updated));
    setUser(normalizedEmail);
    return { success: true };
  }

  function login(email, password) {
    const normalizedEmail = normalizeEmail(email);
    const users = getStoredUsers();
    const match = users.find(
      (u) => u.email === normalizedEmail && u.password === password
    );
    if (!match) {
      return { success: false, error: 'Incorrect email or password.' };
    }
    setUser(match.email);
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