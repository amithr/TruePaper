import { REACHABILITY_PING_INTERVAL_MS } from "@/lib/offline/config";

let lastReachable = true;
let lastCheckAt = 0;

export async function pingServerReachable(): Promise<boolean> {
  try {
    const res = await fetch("/api/public/ping", {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    lastReachable = res.ok;
    lastCheckAt = Date.now();
    return lastReachable;
  } catch {
    lastReachable = false;
    lastCheckAt = Date.now();
    return false;
  }
}

export function cachedServerReachable(maxAgeMs = REACHABILITY_PING_INTERVAL_MS): boolean {
  if (Date.now() - lastCheckAt > maxAgeMs) {
    return typeof navigator !== "undefined" && navigator.onLine;
  }
  return lastReachable;
}

export function resetReachabilityCache(): void {
  lastReachable = true;
  lastCheckAt = 0;
}
