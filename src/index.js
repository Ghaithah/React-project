import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './components/AuthContext';
import { ProfileProvider } from './components/ProfileContext';
import { WatchHistoryProvider } from './components/WatchHistoryContext';
import { MyListProvider } from './components/MyListContext';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';

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
            <App />
          </MyListProvider>
        </WatchHistoryProvider>
      </ProfileProvider>
    </AuthProvider>
  </BrowserRouter>
);


reportWebVitals();