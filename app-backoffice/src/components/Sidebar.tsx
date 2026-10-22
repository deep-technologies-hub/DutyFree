import { NavLink } from 'react-router-dom';
import { useBackofficeStore } from '../store/backofficeStore';
import { LayoutDashboard, TrendingUp, ShoppingBag, Users, Settings, FileDown, LogOut, BarChart3, Plane, Star, Tag, CreditCard } from 'lucide-react';

const nav = [
  { section: 'Analyse' },
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
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
          <div style={{ width: 28, height: 28, background: 'var(--accent)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <BarChart3 size={14} color="#0C0D11" strokeWidth={2.5} />
          </div>
          <div>
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
            : <NavLink key={item.to} to={item.to!} end={item.to === '/'} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <item.icon size={13} strokeWidth={1.8} />
              {item.label}
            </NavLink>
        )}
      </nav>

      {/* User footer */}
      {user && (
        <div style={{ padding: '11px 12px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 26, height: 26, borderRadius: 5, background: 'var(--surface-3)', border: '1px solid var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>
            {initials.toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.full_name || user.username}</div>
            <div style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{user.role}</div>
          </div>
          <button onClick={logout} title="Déconnexion"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 3, borderRadius: 3, transition: 'color 0.14s' }}
            onMouseOver={e => (e.currentTarget.style.color = 'var(--c-down)')}
            onMouseOut={e => (e.currentTarget.style.color = 'var(--text-3)')}>
            <LogOut size={13} />
          </button>
        </div>
      )}
    </aside>
  );
}
