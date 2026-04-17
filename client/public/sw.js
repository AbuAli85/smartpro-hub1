/**
 * Employee portal — minimal service worker (shell cache).
 *
 * Phase-2 wiring (client):
 * - `registration.waiting` → user-facing “Update available” + reload (pair with `SKIP_WAITING` message handler below if added).
 * - Versioned CACHE constant per deploy; delete old keys in activate (already partial).
 *
 * Phase-2 safety:
 * - Never queue offline mutations here without idempotency + conflict rules on the server.
 * - Offline: network-first for navigations, cache fallback for static; /api and /trpc stay uncached as truth.
 * - Add maskable PNG icons (192/512) in manifest for install quality.
 *
 * skipWaiting is NOT called here so updates stay in `registration.waiting` until the client
 * posts { type: 'SKIP_WAITING' } (see registerServiceWorkerUpdatePrompt.ts). First install
 * still activates immediately when no prior controller exists.
 */
const CACHE = "employee-portal-shell-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(["/", "/index.html"]).catch(() => undefined)),
  );
});

self.addEventListener("message", (event) => {
  // Only same-origin clients may trigger activation (CodeQL js/missing-origin-check).
  if (event.origin !== self.location.origin) return;
  if (!event.data || typeof event.data !== "object") return;
  if (event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
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
