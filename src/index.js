import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './components/AuthContext';
import { ProfileProvider } from './components/ProfileContext';
import { WatchHistoryProvider } from './components/WatchHistoryContext';
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
          <App />
        </WatchHistoryProvider>
      </ProfileProvider>
    </AuthProvider>
  </BrowserRouter>
);


reportWebVitals();