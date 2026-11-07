const CACHE = "prochitano-v1";

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./src/app.js",
  "./src/domain.js",
  "./src/store.js",
  "./src/parse.js",
  "./src/seed.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function cacheResponse(request, response) {
  if (response.ok && new URL(request.url).origin === self.location.origin) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response);
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          await cacheResponse(request, response.clone());
          return response;
        })
        .catch(async () => {
          return (await caches.match(request)) || (await caches.match("./index.html"));
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then(async (response) => {
          await cacheResponse(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
