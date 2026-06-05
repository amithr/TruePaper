/** Format milliseconds remaining as M:SS for session countdown UI. */
export function formatSessionCountdown(ms: number): string {
  if (ms <= 0) {
    return "0:00";
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Short masked device id for teacher dashboard rows. */
export function maskDashboardDeviceId(id: string): string {
  return `…${id.slice(-8)}`;
}
