/**
 * Employee portal — minimal service worker (shell cache).
 *
 * Next phase (recommended, not implemented here):
 * - Bump CACHE name on each production deploy + precache hashed assets (e.g. vite-plugin-pwa / Workbox).
 * - skipWaiting + clients.claim with an in-app “Update available” toast.
 * - Offline: network-first for navigations, cache fallback for static; never cache /api or /trpc responses as “truth”.
 * - Maskable PNG icons (192/512) in manifest for install quality.
 */
const CACHE = "employee-portal-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(["/", "/index.html"]).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/trpc")) {
    event.respondWith(fetch(request).catch(() => new Response(null, { status: 503 })));
    return;
  }

  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && request.mode === "navigate") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/index.html", copy)).catch(() => undefined);
        }
        return res;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/index.html"))),
  );
});
