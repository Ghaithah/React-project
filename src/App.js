import logo from './logo.svg';
import './App.css';
import Header from './components/Header';
import Footer from './components/Footer';
import { useRoutes } from 'react-router-dom';
import { routes } from './routes';

function App() {
  const elements = useRoutes(routes)
  return (
    <div className="App">
      <Header/>
      <main className="App-main">
        {elements}
      </main>
      <Footer/>
    </div>
  );
}

export default App;