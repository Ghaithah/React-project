import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import Logo from './Logo'
import './Header.css'

function Header(props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';

  function handleLogout() {
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
              <li className="nav-item">
                <span className="nav-link text-white">Welcome, {user}</span>
              </li>
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