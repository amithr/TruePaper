/** Crockford-style base32 (same charset as class join codes). Personal rejoin codes are 8 characters. */
const RESUME_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export const RESUME_CODE_LENGTH = 8;

export function normalizeResumeCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidResumeCodeFormat(value: string): boolean {
  const normalized = normalizeResumeCode(value);
  return new RegExp(`^[${RESUME_ALPHABET}]{${RESUME_CODE_LENGTH}}$`).test(normalized);
}

export function formatResumeCodeForDisplay(value: string): string {
  const n = normalizeResumeCode(value);
  if (n.length !== RESUME_CODE_LENGTH) {
    return n;
  }
  return `${n.slice(0, 4)} ${n.slice(4)}`;
}
