import { Component } from 'react';
import { Link } from 'react-router-dom';
import './ErrorBoundary.css';

/**
 * Catches a render-time crash anywhere in whatever route is currently
 * mounted (see App.js, which wraps <main>{elements}</main> in this) and
 * swaps in a friendly recovery screen instead of the blank white page
 * React leaves behind by default when a component throws during render.
 * Before this existed, a bug in any single page (a bad OMDb response
 * shaped unexpectedly, a null field a component didn't guard against,
 * etc.) would take down the entire visible app with nothing on screen
 * to explain what happened or how to recover short of a manual URL
 * edit.
 *
 * Scoped to <main> rather than the whole app shell so Header/Footer
 * (and the floating chat assistant) stay live even when the page
 * they're framing has crashed — from here, "Go to Home" below is a
 * real, working nav click, not just a page reload.
 *
 * Deliberately a class component: componentDidCatch/getDerivedStateFromError
 * are the only way to catch a render error in a subtree — there's no
 * hook equivalent for this.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Caught a render error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary__box">
            <p className="error-boundary__kicker">Something went wrong</p>
            <h1 className="error-boundary__title">This page hit a snag</h1>
            <p className="error-boundary__body">
              Something on this page broke unexpectedly. The rest of the site is still working —
              try heading back home, or reload if the problem sticks around.
            </p>
            <div className="error-boundary__actions">
              {/* A real route change (rather than window.location assignment)
                  so App.js's key={location.pathname} on this boundary
                  actually fires — that's what unmounts this crashed
                  instance and mounts a fresh one, clearing hasError
                  without a full page reload. */}
              <Link to="/" className="error-boundary__home-btn">
                Go to Home
              </Link>
              <button
                type="button"
                className="error-boundary__reload-btn"
                onClick={() => window.location.reload()}
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;