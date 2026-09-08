import { Link } from 'react-router-dom';
import './NotFoundPage.css';

/**
 * Catch-all for any URL that doesn't match a real route (see the
 * {path: '*'} entry in routes.js) — a mistyped address, an old bookmark
 * to something since renamed, or just a stray character. Before this
 * route existed, an unknown path fell through react-router-dom's route
 * table with nothing to render at all: Header and Footer still showed,
 * but the space between them was just blank, with no indication
 * anything had gone wrong or how to get back to somewhere real.
 *
 * Deliberately NOT nested behind ProtectedRoute/RequireProfile like the
 * rest of this app's routes (see routes.js) — "this page doesn't exist"
 * is true regardless of whether you're logged in, and a logged-out
 * visitor who mistypes a URL should see that clearly instead of being
 * silently bounced to /login with no explanation of why they ended up
 * there.
 */
export default function NotFoundPage() {
  return (
    <div className="not-found-page">
      <p className="not-found-page__code" aria-hidden="true">404</p>
      <h1 className="not-found-page__title">Lost the plot</h1>
      <p className="not-found-page__body">
        There's nothing at this address. The page may have moved, or the link might just be
        mistyped.
      </p>
      <Link to="/" className="not-found-page__home-btn">
        Back to Home
      </Link>
    </div>
  );
}