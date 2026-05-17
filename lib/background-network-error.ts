/** True when fetch() failed at the network layer (offline dev server, sleep, etc.). */
export function isBackgroundNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return message === "failed to fetch" || message.includes("networkerror");
}

/** User-facing message for background refresh failures; null = stay quiet (transient network). */
export function messageForBackgroundRefreshError(
  error: unknown,
  fallback: string,
): string | null {
  if (isBackgroundNetworkError(error)) {
    return null;
  }
  return error instanceof Error ? error.message : fallback;
}
