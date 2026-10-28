import { NavLink } from 'react-router-dom';
import { useBackofficeStore } from '../store/backofficeStore';
import { LayoutDashboard, TrendingUp, ShoppingBag, Users, Settings, FileDown, LogOut, BarChart3, Plane, Star, Tag, CreditCard } from 'lucide-react';

const ROLES: Record<string, string> = {
  admin: 'Administrateur', superviseur: 'Superviseur', stock_manager: 'Gestionnaire de stock', caissier: 'Caissier',
};

const nav = [
  { section: 'Analyse' },
  { to: '/', icon: LayoutDashboard, label: 'Tableau de bord' },
  { to: '/reporting', icon: BarChart3, label: 'Reporting' },
  { section: 'Données' },
  { to: '/ventes', icon: ShoppingBag, label: 'Ventes' },
  { to: '/produits', icon: TrendingUp, label: 'Produits' },
  { to: '/categories', icon: Tag, label: 'Catégories' },
  { to: '/passagers', icon: Plane, label: 'Taux de capture' },
  { section: 'Admin' },
  { to: '/fidelite', icon: Star, label: 'Fidélité' },
  { to: '/utilisateurs', icon: Users, label: 'Utilisateurs' },
  { to: '/exports', icon: FileDown, label: 'Exports' },
  { to: '/configuration', icon: Settings, label: 'Configuration' },
  { to: '/abonnement', icon: CreditCard, label: 'Abonnement', adminOnly: true },
];

export default function Sidebar() {
  const { user, logout } = useBackofficeStore();
  const initials = user ? (user.full_name?.[0] ?? user.username?.[0] ?? '?') : '?';

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div className="sidebar-logo-icon">
            <BarChart3 size={15} strokeWidth={2.4} />
          </div>
          <div className="sidebar-logo-text" style={{ minWidth: 0 }}>
            <div className="sidebar-logo-mark">{user?.organisation?.nom || 'Duty Free Manager'}</div>
            <div className="sidebar-logo-sub">Backoffice</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
        {nav.filter(item => !('adminOnly' in item) || user?.role === 'admin').map((item, idx) =>
          'section' in item
            ? <div key={idx} className="nav-section">{item.section}</div>
            : <NavLink key={item.to} to={item.to!} end={item.to === '/'} title={item.label} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <item.icon size={13} strokeWidth={1.8} />
              <span className="nav-label">{item.label}</span>
            </NavLink>
        )}
      </nav>

      {/* User footer */}
      {user && (
        <div className="sidebar-user sidebar-user-row">
          <div className="sidebar-avatar">{initials.toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sidebar-user-name">{user.full_name || user.username}</div>
            <div className="sidebar-user-role">{ROLES[user.role] ?? user.role}</div>
          </div>
          <button onClick={logout} title="Déconnexion" aria-label="Déconnexion" className="sidebar-logout" style={{ padding: 7 }}>
            <LogOut size={13} />
          </button>
        </div>
      )}
    </aside>
  );
}
