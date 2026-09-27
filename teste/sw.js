/* ============================================================
   sw.js — Service Worker básico para PWA
   Cacheia assets estáticos para funcionar offline e instalação.
   ============================================================ */

const CACHE_VERSION = 'hermes-pro-v1';
const CACHE_NAME = `hermes-pro-${CACHE_VERSION}`;
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/app-interface.js',
  '/motion-fx.js',
  '/automations-subtabs.js',
  '/app.js',
  '/produtos.js',
  '/instagram-latest-posts.js',
  '/instagram-tester-onboarding.js',
  '/instagram-tester-admin.js',
  '/manifest.json',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/favicon-32.png',
  '/icons/icon-72.png',
  '/icons/icon-96.png',
  '/icons/icon-128.png',
  '/icons/icon-144.png',
  '/icons/icon-152.png',
  '/icons/icon-384.png',
];

// Instala: cacheia assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

// Ativa: remove caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Busca: serve do cache primeiro, depois da rede
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Ignora chamadas ao Supabase API (sempre da rede)
  if (event.request.url.includes('supabase.co')) return;

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit
        if (response) return response;

        // Clone e faz fetch
        return fetch(event.request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        }).catch(() => {
          // Offline fallback
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/index.html');
          }
        });
      })
  );
});

// Push notifications (opcional - para lembrar de reconnectar Instagram)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Hermes Pro';
  const options = {
    body: data.body || 'Você tem notificações sobre suas automações.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    image: data.image ? data.image : undefined,
    tag: 'hermes-notification',
    renotify: true,
    actions: [
      { action: 'open', title: 'Abrir Hermes Pro' },
      { action: 'dismiss', title: 'Dispensar' },
    ],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'open' || event.action === '') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => client.focus());
      })
    );
  }
});
