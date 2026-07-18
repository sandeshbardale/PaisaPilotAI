import {
  BookOpen,
  BrainCircuit,
  ChevronRight,
  Compass,
  LayoutDashboard,
  LogOut,
  Settings,
  Sparkles,
  Upload,
  WalletCards,
  Wrench,
} from 'lucide-react';
import { useAuth } from '../AuthContext';
import type { Page } from '../types';

interface Props {
  page: Page;
  onNav: (p: Page) => void;
  mobileOpen?: boolean;
}

const NAV: { icon: React.ElementType; label: string; page: Page }[] = [
  { icon: LayoutDashboard, label: 'Overview',        page: 'dashboard' },
  { icon: WalletCards,     label: 'Transactions',    page: 'transactions' },
  { icon: Upload,          label: 'Upload Statement',page: 'upload' },
  { icon: BrainCircuit,    label: 'AI Insights',     page: 'chat' },
  { icon: Wrench,          label: 'AI Tools',        page: 'tools' },
  { icon: Compass,         label: 'Travel Guide',    page: 'travel' },
  { icon: BookOpen,        label: 'Khatabook',       page: 'khatabook' },
  { icon: Settings,        label: 'Settings',        page: 'settings' },
];

export default function Sidebar({ page, onNav, mobileOpen }: Props) {
  const { user, logout } = useAuth();
  const initials = user?.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? 'U';

  return (
    <aside className={`sidebar${mobileOpen ? ' open' : ''}`}>
      <div className="brand">
        <i className="brand-icon">₹</i>
        PaisaPilot <b>AI</b>
      </div>

      <div
        className="profile"
        onClick={() => onNav('settings')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onNav('settings')}
      >
        <span className="profile-av">{initials}</span>
        <span className="profile-name">{user?.name ?? 'User'}</span>
        <ChevronRight size={14} style={{ marginLeft: 'auto' }} />
      </div>

      <nav className="sidebar-nav">
        {NAV.map(({ icon: Icon, label, page: p }) => (
          <button
            key={p}
            className={`nav-btn${page === p ? ' active' : ''}`}
            onClick={() => onNav(p)}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <button className="nav-btn logout-btn" onClick={logout}>
          <LogOut size={17} />
          Sign out
        </button>
        <div className="pro-badge">
          <Sparkles size={15} />
          <span>
            <b>Unlock full potential</b>
            <small>Get PaisaPilot Pro</small>
          </span>
        </div>
      </div>
    </aside>
  );
}
