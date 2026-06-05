const CACHE = "truepaper-shell-v2";
const SHELL_URLS = ["/", "/en", "/uk"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

function shouldBypassServiceWorker(request) {
  if (request.method !== "GET") {
    return true;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return true;
  }
  if (url.pathname.startsWith("/api/")) {
    return true;
  }
  // Never intercept Next.js App Router navigations (RSC payloads, prefetch, actions).
  if (
    url.searchParams.has("_rsc") ||
    request.headers.get("RSC") === "1" ||
    request.headers.get("Next-Router-Prefetch") === "1" ||
    request.headers.get("Next-Router-State-Tree") != null ||
    request.headers.get("Next-Action") != null
  ) {
    return true;
  }
  return false;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (shouldBypassServiceWorker(request)) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached ?? fetch(request))),
  );
});
