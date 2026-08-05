import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import './Login.css';

function Login() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const { login, register, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from?.pathname || '/';

  if (user) {
    navigate(redirectTo, { replace: true });
    return null;
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('Please fill in both fields.');
      return;
    }

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      const result = register(username.trim(), password);
      if (!result.success) {
        setError(result.error);
        return;
      }
    } else {
      const result = login(username.trim(), password);
      if (!result.success) {
        setError(result.error);
        return;
      }
    }

    navigate(redirectTo, { replace: true });
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-perf login-perf--top" />

        <div className="login-card__body">
          <p className="login-eyebrow">Watch &amp; Wonder</p>
          <h1 className="login-title">
            {mode === 'login' ? 'Welcome back' : 'Join the marquee'}
          </h1>
          <p className="login-subtitle">
            {mode === 'login'
              ? 'Sign in to keep browsing.'
              : 'Create an account to start browsing.'}
          </p>

          <form onSubmit={handleSubmit} className="login-form">
            <label className="login-field">
              <span className="login-field__label">Username</span>
              <input
                name="uname"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                autoComplete="username"
              />
            </label>

            <label className="login-field">
              <span className="login-field__label">Password</span>
              <input
                type="password"
                name="pass"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </label>

            {mode === 'register' && (
              <label className="login-field">
                <span className="login-field__label">Confirm password</span>
                <input
                  type="password"
                  name="confirmPass"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                />
              </label>
            )}

            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}

            <button className="login-submit" type="submit">
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <p className="login-switch">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              type="button"
              className="login-switch__link"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError('');
              }}
            >
              {mode === 'login' ? 'Create one' : 'Sign in'}
            </button>
          </p>
        </div>

        <div className="login-perf login-perf--bottom" />
      </div>
    </div>
  );
}

export default Login;