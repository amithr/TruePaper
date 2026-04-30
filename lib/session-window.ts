const MAX_TIMED_SESSION_MINUTES = 480;
export const UNLIMITED_SESSION_YEARS = 100;

function toMs(value: string): number {
  return new Date(value).getTime();
}

export function getSessionDurationMinutes(opensAt: string, closesAt: string): number | null {
  const openMs = toMs(opensAt);
  const closeMs = toMs(closesAt);
  if (!Number.isFinite(openMs) || !Number.isFinite(closeMs) || closeMs <= openMs) {
    return null;
  }
  return Math.floor((closeMs - openMs) / 60000);
}

export function isNoTimeLimitSession(opensAt: string, closesAt: string): boolean {
  const durationMinutes = getSessionDurationMinutes(opensAt, closesAt);
  if (durationMinutes === null) {
    return false;
  }
  return durationMinutes > MAX_TIMED_SESSION_MINUTES;
}
