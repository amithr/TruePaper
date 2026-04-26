const MAX_LEN = 120;

/** Collapses internal whitespace; does not trim here — use after trim for storage. */
export function normalizeLiveSessionDisplayName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function isValidLiveSessionDisplayName(raw: string): boolean {
  const n = normalizeLiveSessionDisplayName(raw);
  return n.length >= 1 && n.length <= MAX_LEN;
}
