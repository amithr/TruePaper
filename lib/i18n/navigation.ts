import { LOCALES, type Locale } from "@/lib/i18n/config";

/**
 * Strip a leading `/<locale>` segment if present, returning the remaining
 * pathname (always starts with `/`).
 */
export function stripLocale(pathname: string): { locale: Locale | null; rest: string } {
  if (!pathname.startsWith("/")) {
    return { locale: null, rest: pathname };
  }
  const segments = pathname.split("/");
  // segments = ["", "<maybeLocale>", ...]
  const first = segments[1];
  if (first && (LOCALES as readonly string[]).includes(first)) {
    const rest = "/" + segments.slice(2).join("/");
    return { locale: first as Locale, rest: rest === "/" ? "/" : rest.replace(/\/$/, "") || "/" };
  }
  return { locale: null, rest: pathname };
}

/**
 * Prepend the given locale to a relative path, preserving query and hash.
 * External or absolute URLs (e.g. `https://…`, `mailto:`) pass through.
 *
 *   localizeHref("/dashboard", "uk") -> "/uk/dashboard"
 *   localizeHref("/dashboard#x", "uk") -> "/uk/dashboard#x"
 *   localizeHref("/", "uk") -> "/uk"
 *   localizeHref("https://example.com", "uk") -> "https://example.com"
 */
export function localizeHref(href: string, locale: Locale): string {
  if (!href) {
    return `/${locale}`;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) {
    return href;
  }
  if (!href.startsWith("/")) {
    return href;
  }
  const { rest } = stripLocale(href);
  if (rest === "/" || rest === "") {
    return `/${locale}`;
  }
  return `/${locale}${rest}`;
}

/**
 * Swap the locale segment of an already-localized path to `nextLocale`,
 * preserving the rest (and any query / hash).
 *
 *   switchLocaleInPath("/uk/dashboard?x=1", "en") -> "/en/dashboard?x=1"
 *   switchLocaleInPath("/uk", "en") -> "/en"
 */
export function switchLocaleInPath(fullPath: string, nextLocale: Locale): string {
  const [pathPart, ...queryHashParts] = splitPathAndSuffix(fullPath);
  const suffix = queryHashParts.join("");
  const { rest } = stripLocale(pathPart);
  if (rest === "/" || rest === "") {
    return `/${nextLocale}${suffix}`;
  }
  return `/${nextLocale}${rest}${suffix}`;
}

function splitPathAndSuffix(path: string): [string, string, string] {
  const hashIdx = path.indexOf("#");
  const queryIdx = path.indexOf("?");
  const cut = [hashIdx, queryIdx].filter((n) => n >= 0).sort((a, b) => a - b)[0];
  if (cut === undefined) {
    return [path, "", ""];
  }
  return [path.slice(0, cut), path.slice(cut), ""];
}
