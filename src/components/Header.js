import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'

function Header(props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <nav className="navbar navbar-dark bg-dark">
      <div className="container d-flex justify-content-between align-items-center">
        <span className="navbar-brand mb-0 h1">
          <i className="bi bi-people me-2"></i>
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
            <li className="nav-item">
              <Link className="nav-link" to="/login">Login</Link>
            </li>
          )}
        </ul>
      </div>
    </nav>
  );
}

export default Header;