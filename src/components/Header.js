import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { useProfiles } from './ProfileContext'
import { ProfileAvatar } from './Avatars'
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

  // Clicking the brand always sends you back to the top-level browse
  // page. If a movie's trailer/detail panel was open (tracked via the
  // ?movie= query param), navigating to the bare "/" drops that param,
  // which MovieSearch already treats as "close the panel" — so this
  // doubles as a reset to the top of the page, not just a route change.
  function handleBrandClick() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <nav className="navbar navbar-dark bg-dark app-header">
      <div className="container d-flex justify-content-between align-items-center">
        <Link
          to="/"
          className="navbar-brand app-header__brand mb-0 h1 d-flex align-items-center gap-2"
          onClick={handleBrandClick}
          aria-label="Watch & Wonder — back to browse"
        >
          <Logo height={48} showWordmark={false} />
          {/* Wrapped in its own span (rather than left as bare text next
              to the logo) so the narrowest phone widths can drop just
              this wordmark via CSS — see the max-width: 480px rule in
              Header.css — while the Link keeps its aria-label so the
              brand is still announced correctly with the text hidden. */}
          <span className="app-header__brand-text">Watch & Wonder</span>
        </Link>

        <ul className="nav align-items-center mb-0">
          {user ? (
            <>
              {activeProfile && !isProfilesPage && (
                <>
                  {/* Dedicated "Browse by Genre" entry point (see
                      components/Genres.js) — a tile grid rather than
                      only the Filters panel's Genre dropdown, so
                      genre-browsing has its own findable spot in the
                      nav instead of requiring a search first. */}
                  <li className="nav-item">
                    <Link className="nav-link" to="/genres">Genres</Link>
                  </li>
                  {/* Same reasoning as Genres above, for My List (see
                      components/MyListPage.js): before this, the only
                      way to see what you'd saved was a shelf on the
                      plain browse view — easy to scroll past, and gone
                      entirely while searching/filtering. This gives it
                      a permanent, findable spot in the nav instead. */}
                  <li className="nav-item">
                    <Link className="nav-link" to="/my-list">My List</Link>
                  </li>
                  <li className="nav-item">
                    <button
                      type="button"
                      className="app-header__profile-avatar"
                      onClick={() => navigate('/profiles')}
                      title="Switch profile"
                      aria-label="Switch profile"
                    >
                      <ProfileAvatar profile={activeProfile} size={30} />
                    </button>
                  </li>
                  {/* The greeting is keyed off the active PROFILE's name
                      (e.g. "Courtney"), not the account's login email —
                      each profile sets its own display name from the
                      "Who's watching?" screen. Hidden below 640px (see
                      Header.css) since it's the single biggest chunk of
                      text in the bar and purely redundant with the
                      profile avatar sitting right next to it — losing
                      it is what keeps the rest of the nav on one line
                      on a phone instead of wrapping onto a second/third
                      row underneath the brand. */}
                  <li className="nav-item">
                    <span className="nav-link text-white app-header__welcome">Welcome, {activeProfile.name}</span>
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