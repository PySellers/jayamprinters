// Minimal app-shell cache so the storefront can be "installed" as a PWA.
// This does NOT cache API responses (those must always be live/fresh) --
// only the static shell files, so the app opens instantly and works even on
// a flaky connection, then talks to the live API for real data.
const CACHE_NAME = "srijayam-shell-v1";
const SHELL_FILES = [
  "./storefront.html",
  "./admin.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Never cache API calls -- always go to the network for live data.
  if (url.port === "8000" || url.pathname.startsWith("/catalog") || url.pathname.startsWith("/quotes") ||
      url.pathname.startsWith("/orders") || url.pathname.startsWith("/jobs") || url.pathname.startsWith("/reports")) {
    return; // let the browser handle it normally
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
