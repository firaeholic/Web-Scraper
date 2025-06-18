import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import ScrapeForm from './components/ScrapeForm';
import Dashboard from './components/Dashboard';
import './App.css';

function Navigation() {
  const location = useLocation();
  
  return (
    <nav className="bg-blue-600 text-white p-4 shadow-lg">
      <div className="container mx-auto flex justify-between items-center">
        <h1 className="text-2xl font-bold">Web Scraper</h1>
        <div className="space-x-4">
          <Link 
            to="/" 
            className={`px-4 py-2 rounded transition-colors ${
              location.pathname === '/' 
                ? 'bg-blue-800 text-white' 
                : 'bg-blue-500 hover:bg-blue-700'
            }`}
          >
            Scrape Form
          </Link>
          <Link 
            to="/dashboard" 
            className={`px-4 py-2 rounded transition-colors ${
              location.pathname === '/dashboard' 
                ? 'bg-blue-800 text-white' 
                : 'bg-blue-500 hover:bg-blue-700'
            }`}
          >
            Dashboard
          </Link>
        </div>
      </div>
    </nav>
  );
}

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-100">
        <Navigation />
        <main className="container mx-auto py-8 px-4">
          <Routes>
            <Route path="/" element={<ScrapeForm />} />
            <Route path="/dashboard" element={<Dashboard />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
