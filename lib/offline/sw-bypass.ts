/** Request shape for service-worker bypass checks (mirrors public/sw.js logic). */
export type SwBypassRequest = {
  method: string;
  url: string;
  headers: { get(name: string): string | null };
};

/** True when the service worker should not intercept (API, RSC, non-GET, cross-origin). */
export function shouldBypassServiceWorker(
  request: SwBypassRequest,
  locationOrigin: string,
): boolean {
  if (request.method !== "GET") {
    return true;
  }
  const url = new URL(request.url);
  if (url.origin !== locationOrigin) {
    return true;
  }
  if (url.pathname.startsWith("/api/")) {
    return true;
  }
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
