import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useStockStore } from '../store/stockStore';
import {
  LayoutDashboard, Package, FileText, Truck,
  ClipboardList, AlertTriangle, ShoppingCart, ScanSearch, LogOut, Tag
} from 'lucide-react';

const ROLES: Record<string, string> = {
  admin: 'Administrateur', superviseur: 'Superviseur', stock_manager: 'Gestionnaire de stock', caissier: 'Caissier',
};

const nav = [
  { section: 'Vue d\'ensemble' },
  { to: '/', icon: LayoutDashboard, label: 'Tableau de bord' },
  { section: 'Catalogue' },
  { to: '/produits', icon: Package, label: 'Produits' },
  { to: '/categories', icon: Tag, label: 'Catégories' },
  { to: '/fournisseurs', icon: Truck, label: 'Fournisseurs' },
  { to: '/commandes', icon: ShoppingCart, label: 'Commandes' },
  { section: 'Mouvements' },
  { to: '/mouvements', icon: ClipboardList, label: 'Mouvements' },
  { to: '/inventaire', icon: ScanSearch, label: 'Inventaire' },
  { section: 'Conformité' },
  { to: '/sommiers', icon: FileText, label: 'Sommiers DJBC' },
  { to: '/alertes', icon: AlertTriangle, label: 'Alertes' },
];

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const { isOffline } = useStockStore();

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div className="sidebar-logo-icon">
            <Package size={15} strokeWidth={2.2} />
          </div>
          <div className="sidebar-logo-text" style={{ minWidth: 0 }}>
            <div className="sidebar-logo-mark">{user?.organisation?.nom || 'Duty Free Manager'}</div>
            <div className="sidebar-logo-sub">Stock</div>
          </div>
        </div>
        {isOffline && (
          <div className="sidebar-offline" style={{ marginTop: 8, fontSize: 10, background: 'rgba(255,255,255,0.18)', borderRadius: 4, padding: '3px 8px', color: '#fff', fontWeight: 600, letterSpacing: '0.05em' }}>
            ⚠ HORS LIGNE
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {nav.map((item, i) => {
          if ('section' in item && !('to' in item)) {
            return <div key={i} className="nav-section">{item.section}</div>;
          }
          const { to, icon: Icon, label } = item as { to: string; icon: React.ElementType; label: string };
          return (
            <NavLink key={to} to={to} end={to === '/'} title={label}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon size={15} />
              <span className="nav-label">{label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* User */}
      <div className="sidebar-user">
        <div className="sidebar-user-row" style={{ marginBottom: 10 }}>
          <div className="sidebar-avatar">
            {user?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div className="sidebar-user-name">{user?.full_name || user?.username}</div>
            <div className="sidebar-user-role">{ROLES[user?.role ?? ''] ?? user?.role}</div>
          </div>
        </div>
        <button onClick={logout} className="sidebar-logout" style={{ width: '100%' }}>
          <LogOut size={13} /> <span className="sidebar-logout-label">Déconnexion</span>
        </button>
      </div>
    </aside>
  );
}
