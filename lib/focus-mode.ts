import { LOCALES } from "@/lib/i18n/config";

const LOCALE_PREFIX = `(?:${LOCALES.join("|")})`;

/** Routes where global footer and cookie chrome should stay hidden. */
const FOCUS_PATH_PATTERNS = [
  new RegExp(`^/${LOCALE_PREFIX}/join(?:/|$)`),
  new RegExp(`^/${LOCALE_PREFIX}/live(?:/|$)`),
  new RegExp(`^/${LOCALE_PREFIX}/review(?:/|$)`),
  new RegExp(`^/${LOCALE_PREFIX}/dashboard/sessions/[^/]+/watch(?:/|$)`),
];

export function isFocusPath(pathname: string): boolean {
  return FOCUS_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}

export const BODY_FOCUS_ATTR = "data-tp-focus";
