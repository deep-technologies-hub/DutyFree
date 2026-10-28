import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Reporting from './pages/Reporting';
import Ventes from './pages/Ventes';
import { ProduitsPage } from './pages/Produits';
import CategoriesPage from './pages/Categories';
import { UtilisateursPage } from './pages/Utilisateurs';
import { PassagersPage } from './pages/Others';
import { ExportsPage } from './pages/Exports';
import { ConfigurationPage } from './pages/Configuration';
import { FidelitePage } from './pages/Fidelite';
import LoginPage from './pages/LoginPage';
import InscriptionPage from './pages/Inscription';
import AbonnementPage from './pages/Abonnement';
import { MotDePasseOubliePage, ReinitialiserPage } from './pages/MotDePasse';
import SubscriptionBanner from './components/SubscriptionBanner';
import { useBackofficeStore } from './store/backofficeStore';

function ProtectedApp() {
  const { fetchDashboard, isOffline, user } = useBackofficeStore();
  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {isOffline && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 999, background: 'var(--accent-dim)', borderBottom: '1px solid var(--accent-border)', padding: '6px 24px', fontSize: 11, fontWeight: 700, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 6, letterSpacing: '0.05em' }}>
          ⚠ SERVEUR INJOIGNABLE — vérifiez la connexion Internet
        </div>
      )}
      <Sidebar />
      <main style={{ flex: 1, overflow: 'auto', paddingTop: isOffline ? 32 : 0 }}>
        <SubscriptionBanner organisation={user?.organisation} />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/reporting" element={<Reporting />} />
          <Route path="/ventes" element={<Ventes />} />
          <Route path="/produits" element={<ProduitsPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/passagers" element={<PassagersPage />} />
          <Route path="/utilisateurs" element={<UtilisateursPage />} />
          <Route path="/fidelite" element={<FidelitePage />} />
          <Route path="/exports" element={<ExportsPage />} />
          <Route path="/configuration" element={<ConfigurationPage />} />
          <Route path="/abonnement" element={<AbonnementPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const { isAuthenticated, checkAuth, logout } = useBackofficeStore();
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
        <Route path="/mot-de-passe-oublie" element={<MotDePasseOubliePage />} />
        <Route path="/reinitialiser" element={<ReinitialiserPage />} />
        <Route path="/inscription" element={isAuthenticated ? <Navigate to="/abonnement" /> : <InscriptionPage />} />
        <Route path="/*" element={isAuthenticated ? <ProtectedApp /> : <Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}
