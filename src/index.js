import React from 'react';
import ReactDOM from 'react-dom/client';
// Bootstrap's CSS must load BEFORE index.css, not after. Bootstrap's
// reboot stylesheet sets `body { background-color: #fff; }` — with
// these two imports in the opposite order (as they were before), that
// rule loaded AFTER index.css's own `body { background-color: #0d0f14; }`
// and, being the same specificity, silently won the cascade and painted
// body white again. That's what was showing as a white flash/gap during
// the mobile overscroll "bounce" past the top or bottom of the page: it
// wasn't the bounce rendering itself, it was body's real background
// actually being white underneath. Importing Bootstrap first means
// index.css (and everything imported after it) always gets the last
// word over Bootstrap's own defaults, which is the order every
// component-level override in this app (Header.css, Footer.css, etc.)
// already assumes.
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './components/AuthContext';
import { ProfileProvider } from './components/ProfileContext';
import { WatchHistoryProvider } from './components/WatchHistoryContext';
import { MyListProvider } from './components/MyListContext';
import { RatingsProvider } from './components/RatingsContext';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <BrowserRouter>
    <AuthProvider>
      <ProfileProvider>
        {/* Needs both useAuth() and useProfiles(), so it has to sit
            inside both of those — this is what was missing and caused
            the blank white screen (MovieSearch calls useWatchHistory()
            unconditionally, which throws without this provider). */}
        <WatchHistoryProvider>
          {/* Same reasoning as WatchHistoryProvider above: MovieSearch
              calls useMyList() unconditionally, so MyListProvider has to
              wrap it too. Nested inside WatchHistoryProvider rather than
              beside it purely so the two per-profile-storage providers
              read top-to-bottom as one group. */}
          <MyListProvider>
            {/* Thumbs up/down (RatingsContext) is the same shape again —
                per-profile localStorage, read unconditionally by
                MovieSearch/MovieCard/HeroBanner/MovieInfoModal — so it
                joins the same group of providers. */}
            <RatingsProvider>
              <App />
            </RatingsProvider>
          </MyListProvider>
        </WatchHistoryProvider>
      </ProfileProvider>
    </AuthProvider>
  </BrowserRouter>
);


reportWebVitals();