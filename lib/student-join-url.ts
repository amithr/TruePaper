import { isValidJoinCodeFormat, normalizeJoinCode } from "@/lib/join-code";
import type { Locale } from "@/lib/i18n/config";

/**
 * Build a join URL that starts a new anonymous student device when opened.
 * Prefer a locale-prefixed path (`/en/join`) so school devices skip the
 * bare `/join` → `/{locale}/join` redirect (extra hops fail more often on
 * flaky classroom Wi‑Fi / captive portals).
 */
export function buildStudentJoinUrl(
  origin: string,
  joinCode: string,
  options?: { locale?: Locale; studentSlotId?: string },
): string {
  const code = normalizeJoinCode(joinCode);
  if (!origin || !isValidJoinCodeFormat(code)) {
    return "";
  }
  const locale = options?.locale;
  const path = locale ? `/${locale}/join` : "/join";
  const u = new URL(path, origin);
  u.searchParams.set("code", code);
  u.searchParams.set("new", "1");
  u.searchParams.set("student", options?.studentSlotId ?? crypto.randomUUID());
  return u.toString();
}
