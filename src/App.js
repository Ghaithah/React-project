import { useState } from 'react';
import './App.css';
import Header from './components/Header';
import Footer from './components/Footer';
import SplashScreen from './components/SplashScreen';
import ErrorBoundary from './components/ErrorBoundary';
import { useRoutes, useLocation } from 'react-router-dom';
import { routes } from './routes';
import MovieChatbot from './components/MovieChatBot';

function App() {
  const elements = useRoutes(routes)
  const location = useLocation();
  // Shows on every full page load/visit; ProtectedRoute (in routes.js)
  // takes it from there and sends anyone who isn't logged in to /login.
  const [showSplash, setShowSplash] = useState(true);

  return (
    <div className="App">
      {/* Skip link: the very first focusable element on the page for
          anyone navigating by keyboard or screen reader. Without it,
          Tab from a fresh page load walks through the entire header —
          brand link, Genres, My List, Stats, the profile switcher,
          Logout, then the Home/Shows/Movies/New & Popular/Browse by
          Languages tab row — before ever reaching the actual page
          content below. Visually hidden until it receives focus (see
          .skip-link in App.css), so sighted mouse users never see it. */}
      <a href="#main-content" className="skip-link">Skip to content</a>
      <Header/>
      <main className="App-main" id="main-content">
        {/* Keyed on the current path so navigating to a DIFFERENT route
            (e.g. clicking "Go to Home" on ErrorBoundary's own fallback
            screen) unmounts and remounts a fresh boundary, clearing
            whatever crashed on the previous page. Without this key, the
            boundary's hasError state would stay stuck true forever after
            the first crash, even once the visitor has navigated
            somewhere that renders fine — see ErrorBoundary.js. */}
        <ErrorBoundary key={location.pathname}>{elements}</ErrorBoundary>
      </main>
      <Footer/>
      {/* Floating movie-chat assistant. Mounted here at the App level
          (rather than inside MovieSearch) so it's available on every
          route and its open/closed state + message history survive
          navigating between pages instead of resetting each time. It
          reads what's currently loaded/visible via MovieCatalogContext
          (see index.js/MovieCatalogContext.js) — MovieSearch is what
          publishes into that context. */}
      <MovieChatbot />
      {/* Rendered on top of the real app (which is already mounted and
          loading underneath) so the exit fade reveals live content
          instead of a blank page — no white flash in between. */}
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
    </div>
  );
}

export default App;