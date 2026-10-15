/* AFK/BOT service worker — caches the static shell only.
 *
 * It deliberately never touches the API: /api/config must always come from the
 * bot process (a cached copy made new settings look like they were lost on
 * refresh) and /api/events is a server-sent event stream that must not be
 * buffered or stored. Bumping CACHE_NAME drops any poisoned cache from an
 * older version.
 */

const CACHE_NAME = "afkbot-v6";
const PRECACHE_URLS = [
  "/manifest.json",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-192-maskable.png",
  "/icons/icon-512-maskable.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isNoStore(res) {
  const value = res.headers.get("Cache-Control") || "";
  return value.includes("no-store") || value.includes("no-cache");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only plain same-origin GETs are handled at all.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Live data: always straight to the bot process, never cached.
  if (url.pathname.startsWith("/api/") || url.pathname === "/status") return;

  // The dashboard itself: network first so a reload always gets the new page.
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.status === 200 && !isNoStore(res)) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached || new Response("Offline", {
          status: 503,
          headers: { "Content-Type": "text/plain" }
        })))
    );
    return;
  }

  // Static assets (icons, manifest): cache first.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          if (!res || res.status !== 200 || res.type === "opaque" || isNoStore(res)) return res;
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(request));
    })
  );
});
