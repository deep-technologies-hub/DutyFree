import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Produits from './pages/Produits';
import Categories from './pages/Categories';
import Mouvements from './pages/Mouvements';
import Sommiers from './pages/Sommiers';
import Fournisseurs from './pages/Fournisseurs';
import Commandes from './pages/Commandes';
import Alertes from './pages/Alertes';
import Inventaire from './pages/Inventaire';
import LoginPage from './pages/LoginPage';
import { useAuthStore } from './store/authStore';
import { useStockStore } from './store/stockStore';

function ProtectedApp() {
  const { fetchAll, isOffline } = useStockStore();
  const [abonnementInactif, setAbonnementInactif] = useState(false);
  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    const onInactive = () => setAbonnementInactif(true);
    window.addEventListener('subscription:inactive', onInactive);
    return () => window.removeEventListener('subscription:inactive', onInactive);
  }, []);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {isOffline && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 999, background: 'var(--accent-border)', borderBottom: '1px solid var(--accent-border)', padding: '6px 24px', fontSize: 12, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
          ⚠ Serveur injoignable — vérifiez la connexion Internet. Les données affichées peuvent être incomplètes.
        </div>
      )}
      <Sidebar />
      <main style={{ flex: 1, overflow: 'auto', paddingTop: isOffline ? 32 : 0 }}>
        {abonnementInactif && (
          <div style={{ background: 'var(--c-down-dim)', borderBottom: '1px solid var(--c-down-bd)', color: 'var(--c-down)', padding: '8px 24px', fontSize: 12, fontWeight: 600 }}>
            Abonnement expiré ou suspendu : lecture seule. L'administrateur peut le renouveler depuis le backoffice (Abonnement).
          </div>
        )}
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/produits" element={<Produits />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/mouvements" element={<Mouvements />} />
          <Route path="/sommiers" element={<Sommiers />} />
          <Route path="/fournisseurs" element={<Fournisseurs />} />
          <Route path="/commandes" element={<Commandes />} />
          <Route path="/alertes" element={<Alertes />} />
          <Route path="/inventaire" element={<Inventaire />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const { isAuthenticated, checkAuth, logout } = useAuthStore();

  useEffect(() => { checkAuth(); }, [checkAuth]);
  // Session expirée (refresh impossible) → retour à l'écran de connexion
  useEffect(() => {
    window.addEventListener('auth:logout', logout);
    return () => window.removeEventListener('auth:logout', logout);
  }, [logout]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={isAuthenticated ? <Navigate to="/" /> : <LoginPage />} />
        <Route path="/*" element={isAuthenticated ? <ProtectedApp /> : <Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}
