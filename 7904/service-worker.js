// service-worker.js
// Cache do "app shell" (HTML/CSS/JS/ícones estáticos) para o app abrir rápido
// e continuar funcionando como um app nativo mesmo com internet instável.
// Dados do Supabase (automações, contas, produtos) nunca são cacheados aqui —
// isso é sempre buscado ao vivo pelos módulos que já existem no projeto.

const CACHE_NAME = "respondi-shell-v1";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./automations-subtabs.js",
  "./instagram-latest-posts.js",
  "./instagram-tester-admin.js",
  "./instagram-tester-onboarding.js",
  "./produtos.js",
  "./motion-fx.js",
  "./pwa-install.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        SHELL_FILES.map((url) => cache.add(url).catch(() => null))
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Nunca intercepta chamadas de API/Supabase — sempre rede, sempre dado fresco.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      // Stale-while-revalidate: mostra o cache na hora, atualiza em segundo plano.
      return cached || network;
    })
  );
});
