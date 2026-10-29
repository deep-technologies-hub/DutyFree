// Enregistrement du service worker (mode hors ligne).
// Fichier séparé plutôt que script en ligne : la politique de sécurité (CSP) interdit les scripts en ligne.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('[SW] Enregistré:', reg.scope);
        // Background sync au retour du réseau
        window.addEventListener('online', () => {
          if (reg.sync) reg.sync.register('sync-ventes').catch(() => {});
        });
      })
      .catch(err => console.warn('[SW] Erreur:', err));

    // Messages du SW vers l'app
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'NETWORK_BACK') {
        window.dispatchEvent(new CustomEvent('sw-network-back'));
      }
    });
  });
}
