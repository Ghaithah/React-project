import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { useProfiles } from './ProfileContext'
import Logo from './Logo'
import './Header.css'

function Header(props) {
  const { user, logout } = useAuth();
  const { activeProfile, clearProfile } = useProfiles();
  const navigate = useNavigate();
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';
  const isProfilesPage = location.pathname === '/profiles';

  function handleLogout() {
    clearProfile();
    logout();
    navigate('/login');
  }

  return (
    <nav className="navbar navbar-dark bg-dark app-header">
      <div className="container d-flex justify-content-between align-items-center">
        <span className="navbar-brand mb-0 h1 d-flex align-items-center gap-2">
        <Logo height={48} showWordmark={false} />
        Watch & Wonder
        </span>

        <ul className="nav align-items-center mb-0">
          {user ? (
            <>
              {activeProfile && !isProfilesPage && (
                <>
                  <li className="nav-item">
                    <button
                      type="button"
                      className="app-header__profile-avatar"
                      onClick={() => navigate('/profiles')}
                      title="Switch profile"
                      aria-label="Switch profile"
                      style={{ background: activeProfile.color }}
                    />
                  </li>
                  {/* The greeting is keyed off the active PROFILE's name
                      (e.g. "Courtney"), not the account's login email —
                      each profile sets its own display name from the
                      "Who's watching?" screen. */}
                  <li className="nav-item">
                    <span className="nav-link text-white">Welcome, {activeProfile.name}</span>
                  </li>
                </>
              )}
              <li className="nav-item">
                <button className="btn btn-outline-light btn-sm" onClick={handleLogout}>
                 Logout
                </button>
              </li>
            </>
          ) : (
            !isLoginPage && (
              <li className="nav-item">
                <Link className="nav-link" to="/login">Login</Link>
              </li>
            )
          )}
        </ul>
      </div>
    </nav>
  );
}

export default Header;