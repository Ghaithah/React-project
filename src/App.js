import { useState } from 'react';
import './App.css';
import Header from './components/Header';
import Footer from './components/Footer';
import SplashScreen from './components/SplashScreen';
import MovieChatbot from './components/MovieChatBot';
import { useRoutes } from 'react-router-dom';
import { routes } from './routes';

function App() {
  const elements = useRoutes(routes)
  // Shows on every full page load/visit; ProtectedRoute (in routes.js)
  // takes it from there and sends anyone who isn't logged in to /login.
  const [showSplash, setShowSplash] = useState(true);

  return (
    <div className="App">
      <Header/>
      <main className="App-main">
        {elements}
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