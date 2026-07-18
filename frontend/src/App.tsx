import { useEffect, useState } from 'react';
import { BrainCircuit, BookOpen, Compass, LayoutDashboard, Menu, WalletCards, Wrench } from 'lucide-react';
import { useAuth } from './AuthContext';
import Sidebar from './components/Sidebar';
import AITools from './pages/AITools';
import Chat from './pages/Chat';
import Khatabook from './pages/Khatabook';
import TravelGuide from './pages/TravelGuide';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import Settings from './pages/Settings';
import Transactions from './pages/Transactions';
import Upload from './pages/Upload';
import type { Page } from './types';

type AuthPage = 'login' | 'register';

export default function App() {
  const { user, loading } = useAuth();
  const [authPage, setAuthPage] = useState<AuthPage>('login');
  const [page, setPage] = useState<Page>('dashboard');

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Apply dark mode class on body
  useEffect(() => {
    document.documentElement.classList.toggle('dark', !!user?.dark_mode);
  }, [user?.dark_mode]);

  // Loading splash
  if (loading) {
    return (
      <div className="splash">
        <div className="auth-brand">
          <i className="brand-icon">₹</i>
          <span>PaisaPilot <b>AI</b></span>
        </div>
        <div className="splash-dots">
          <div className="typing-dot" />
          <div className="typing-dot" />
          <div className="typing-dot" />
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    if (authPage === 'register') {
      return <Register onGoLogin={() => setAuthPage('login')} />;
    }
    return <Login onGoRegister={() => setAuthPage('register')} />;
  }

  // Authenticated app
  return (
    <div className="app">
      {/* Mobile header */}
      <header className="mobile-header">
        <span className="brand">
          <i className="brand-icon">₹</i>
          PaisaPilot <b>AI</b>
        </span>
        <button
          style={{ background: 'none', border: 0, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          onClick={() => setSidebarOpen(v => !v)}
          aria-label="Menu"
        >
          <Menu size={22} />
        </button>
      </header>

      {/* Sidebar — overlay on mobile */}
      {sidebarOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: '#00000050', zIndex: 99 }}
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Sidebar page={page} onNav={(p) => { setPage(p); setSidebarOpen(false); }} mobileOpen={sidebarOpen} />

      <main className="main-content">
        {page === 'dashboard'    && <Dashboard onNav={setPage} />}
        {page === 'transactions' && <Transactions />}
        {page === 'upload'       && <Upload />}
        {page === 'chat'         && <Chat />}
        {page === 'tools'        && <AITools />}
        {page === 'travel'       && <TravelGuide />}
        {page === 'khatabook'    && <Khatabook />}
        {page === 'settings'     && <Settings />}
      </main>

      {/* Mobile bottom navigation */}
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        <div className="mobile-nav-items">
          {([
            [LayoutDashboard, 'Home',     'dashboard'],
            [WalletCards,    'Ledger',    'transactions'],
            [Compass,        'Travel',    'travel'],
            [BookOpen,       'Khata',     'khatabook'],
            [BrainCircuit,   'AI',        'chat'],
            [Wrench,         'Tools',     'tools'],
          ] as [React.ElementType, string, Page][]).map(([Icon, label, p]) => (
            <button key={p} className={`mobile-nav-btn${page === p ? ' active' : ''}`} onClick={() => setPage(p)}>
              <Icon size={20} />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
