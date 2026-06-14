/** True when a failed fetch/submit should be retried later (offline, timeout, 503). */
export function isRetryableNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return true;
    }
    const msg = error.message.toLowerCase();
    if (
      msg.includes("failed to fetch") ||
      msg.includes("networkerror") ||
      msg.includes("network request failed") ||
      msg.includes("load failed")
    ) {
      return true;
    }
    if (msg.includes("503") || msg.includes("502") || msg.includes("504")) {
      return true;
    }
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return true;
  }
  return false;
}
