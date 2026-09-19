// service-worker.js
// Cache do "app shell" (HTML/CSS/JS/ícones estáticos) pra abrir instantâneo e
// funcionar offline (ou com rede ruim) como um app nativo. NUNCA cacheia
// chamadas ao Supabase (auth, banco, storage) — essas sempre vão direto pra
// rede, senão o usuário veria dados desatualizados ou travaria login/logout.

const CACHE_VERSION = "ap-shell-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./instagram-tester-onboarding.js",
  "./instagram-tester-admin.js",
  "./motion-fx.js",
  "./pwa.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-64.png",
];

// Nunca intercepta/cacheia isso — sempre direto pra rede.
const NEVER_CACHE_HOSTS = ["supabase.co", "supabase.in", "facebook.com", "instagram.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isNeverCache(url) {
  return NEVER_CACHE_HOSTS.some((host) => url.hostname.endsWith(host));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // APIs externas / Supabase: nunca interceptar, sempre rede.
  if (url.origin !== self.location.origin || isNeverCache(url)) {
    return;
  }

  // Navegação (usuário abrindo/recarregando a página): tenta a rede primeiro
  // pra sempre pegar a versão mais nova; se estiver offline, cai pro cache.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put("./index.html", clone));
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Estáticos do próprio app: cache primeiro (rápido), atualiza em segundo
  // plano (stale-while-revalidate).
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});

// Permite que pwa.js peça pra ativar uma nova versão do SW imediatamente
// (usado pelo toast "Nova versão disponível").
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
