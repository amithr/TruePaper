/** Crockford-style base32 without I, L, O, U, 0, 1 — easy to read aloud. */
const JOIN_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function normalizeJoinCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidJoinCodeFormat(value: string): boolean {
  return /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(normalizeJoinCode(value));
}

export function generateJoinCode(): string {
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += JOIN_ALPHABET[Math.floor(Math.random() * JOIN_ALPHABET.length)]!;
  }
  return out;
}
