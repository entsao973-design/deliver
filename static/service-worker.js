const APP_VERSION = "2026.06.30.4";
const CACHE_NAME = `delivery-proof-pwa-${APP_VERSION}`;
const SHELL_ASSETS = [
  "/",
  "/driver",
  "/admin",
  "/manifest.webmanifest",
  "/static/app-version.json",
  "/static/styles.css",
  "/static/admin.css",
  "/static/photo-viewer.js",
  "/static/offline-upload-queue.js",
  "/static/driver-api.js",
  "/static/smart-photo.js",
  "/static/driver-smart-delivery.js",
  "/static/scan-invoice.js",
  "/static/driver-scan-delivery.js",
  "/static/app.js",
  "/static/admin-api.js",
  "/static/admin-filter-options.js",
  "/static/admin-photo-view.js",
  "/static/admin-operation-state.js",
  "/static/admin.js",
  "/static/pwa.js",
  "/static/icons/icon-192.png",
  "/static/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => undefined),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET"
    || url.origin !== self.location.origin
    || url.pathname.startsWith("/api/")
  ) {
    return;
  }

  event.respondWith(networkFirst(event.request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    if (request.mode === "navigate") {
      return cache.match("/driver");
    }
    throw error;
  }
}
