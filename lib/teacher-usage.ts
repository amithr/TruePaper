/** "Sessions this term" on the settings usage panel counts the last 120 days. */
export const USAGE_TERM_DAYS = 120;

export function usageTermStartIso(nowMs: number = Date.now()): string {
  return new Date(nowMs - USAGE_TERM_DAYS * 86_400_000).toISOString();
}
