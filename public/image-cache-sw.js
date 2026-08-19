const IMAGE_CACHE = "pmp-images-v1";
const IMAGE_DESTINATIONS = new Set(["image"]);

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith("pmp-images-") && key !== IMAGE_CACHE)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !IMAGE_DESTINATIONS.has(event.request.destination)) return;

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
