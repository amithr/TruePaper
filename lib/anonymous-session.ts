const STORAGE_KEY = "truepaper_anonymous_session_id";

/** UUID v4 string (browser `crypto.randomUUID` satisfies this). */
export function isValidAnonymousSessionId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

export function getOrCreateAnonymousSessionId(): string {
  if (typeof window === "undefined") {
    return "";
  }
  const existing = window.localStorage.getItem(STORAGE_KEY)?.trim();
  if (existing && isValidAnonymousSessionId(existing)) {
    return existing;
  }
  const id = crypto.randomUUID();
  window.localStorage.setItem(STORAGE_KEY, id);
  return id;
}

/** Restore this device after clearing site data or switching browsers (used with a personal rejoin code). */
export function persistAnonymousSessionId(deviceId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  if (!isValidAnonymousSessionId(deviceId)) {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, deviceId);
}
