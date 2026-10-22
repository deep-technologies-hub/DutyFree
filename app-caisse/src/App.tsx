import { useEffect, useState } from 'react';
import { useCaisseStore } from './store/caisseStore';
import Login from './pages/Login';
import POS from './pages/POS';

export default function App() {
  const { currentUser, setOnline, isOnline, offlineQueue, syncOfflineQueue, loadProducts, logout } = useCaisseStore();
  const [abonnementInactif, setAbonnementInactif] = useState(false);

  // Session expirée → écran de connexion ; abonnement expiré → bandeau (les ventes restent en file locale)
  useEffect(() => {
    const onInactive = () => setAbonnementInactif(true);
    window.addEventListener('auth:logout', logout);
    window.addEventListener('subscription:inactive', onInactive);
    return () => {
      window.removeEventListener('auth:logout', logout);
      window.removeEventListener('subscription:inactive', onInactive);
    };
  }, [logout]);

  useEffect(() => {
    const on = () => { setOnline(true); syncOfflineQueue(); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [setOnline, syncOfflineQueue]);

  useEffect(() => {
    if (currentUser) loadProducts();
  }, [currentUser, loadProducts]);

  // Sync automatique toutes les 2min si online et queue non vide
  useEffect(() => {
    if (!isOnline || offlineQueue.length === 0) return;
    const timer = setInterval(syncOfflineQueue, 120000);
    return () => clearInterval(timer);
  }, [isOnline, offlineQueue.length, syncOfflineQueue]);

  if (!currentUser) return <Login />;
  return (
    <>
      {abonnementInactif && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 999, background: 'var(--c-down)', color: '#fff', padding: '8px 16px', fontSize: 12, fontWeight: 700, textAlign: 'center' }}>
          Abonnement expiré : les ventes sont conservées sur ce poste et seront transmises après renouvellement (backoffice → Abonnement).
        </div>
      )}
      <POS />
    </>
  );
}
