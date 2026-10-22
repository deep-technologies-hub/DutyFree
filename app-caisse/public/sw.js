// ── Service Worker — Duty Free Manager Caisse ────────────────────────────
const CACHE_NAME = 'dutyfree-caisse-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
];

// Installation : mise en cache des assets statiques
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activation : suppression des anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch : Network first pour l'API, Cache first pour les assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API → toujours réseau, pas de cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'offline' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 503,
        })
      )
    );
    return;
  }

  // Assets JS/CSS/fonts → Cache first, network fallback
  if (
    url.pathname.match(/\.(js|css|woff2?|png|svg|ico)$/) ||
    url.pathname.startsWith('/assets/')
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Navigation (HTML) → Network first, cache fallback → /index.html
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(cached => cached || caches.match('/index.html'))
      )
  );
});

// Background Sync — synchronisation des ventes offline
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-ventes') {
    event.waitUntil(syncVentesOffline());
  }
});

async function syncVentesOffline() {
  // Signal aux clients que la sync démarre
  const clients = await self.clients.matchAll();
  clients.forEach(client => client.postMessage({ type: 'SYNC_START' }));

  try {
    // La logique réelle est dans le store Zustand côté app
    // Le SW signale juste que le réseau est de retour
    clients.forEach(client => client.postMessage({ type: 'NETWORK_BACK' }));
  } catch (err) {
    clients.forEach(client => client.postMessage({ type: 'SYNC_ERROR', error: err.message }));
  }
}

// Push notifications (préparé pour le futur)
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'DJBC Duty Free', {
      body: data.body,
      icon: '/vite.svg',
      badge: '/vite.svg',
      tag: data.tag || 'notification',
    })
  );
});
