const IMAGE_CACHE = "pmp-images-v1";
const SHELL_CACHE = "pmp-shell-v7";
const IMAGE_DESTINATIONS = new Set(["image"]);
const APP_ROUTES = ["/dashboard", "/projects", "/tasks", "/members"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(APP_ROUTES.map(async (route) => {
      try {
        const response = await fetch(route, { cache: "reload" });
        if (response.ok) await cache.put(`${self.location.origin}${route}`, response);
      } catch {
        // A route can be cached on its first successful navigation instead.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => (
        (key.startsWith("pmp-images-") && key !== IMAGE_CACHE)
        || (key.startsWith("pmp-shell-") && key !== SHELL_CACHE)
      ))
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (event.request.mode === "navigate" && url.origin === self.location.origin && APP_ROUTES.includes(url.pathname)) {
    const cacheKey = `${url.origin}${url.pathname}`;
    const cachePromise = caches.open(SHELL_CACHE);
    const refresh = cachePromise.then((cache) => fetch(event.request).then((response) => {
        if (response.ok) cache.put(cacheKey, response.clone()).catch(() => {});
        return response;
      }));
    event.waitUntil(refresh.catch(() => {}));
    event.respondWith(cachePromise.then((cache) => cache.match(cacheKey)).then((cached) => cached || refresh));
    return;
  }

  if (!IMAGE_DESTINATIONS.has(event.request.destination)) return;

  event.respondWith((async () => {
    const cache = await caches.open(IMAGE_CACHE);
    const cached = await cache.match(event.request);
    if (cached) return cached;

    try {
      const response = await fetch(event.request);
      if (response.ok || response.type === "opaque") {
        cache.put(event.request, response.clone()).catch(() => {});
      }
      return response;
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
  })());
});
