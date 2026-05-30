/**
 * Supported UI locales. Adding a new locale = add an entry here and create a
 * matching `messages/<locale>.json` file. Everything else (proxy routing,
 * provider, switcher, dictionary loader) reads this list and adapts.
 */
export const LOCALES = ["en", "uk"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Persisted locale preference (set by the proxy on each localized request). */
export const LOCALE_COOKIE = "tp_locale";

/** Set when the user picks a language via the toggle — disables auto-detection. */
export const LOCALE_EXPLICIT_COOKIE = "tp_locale_explicit";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  uk: "Українська",
};

/** Short codes shown in compact UIs (e.g. the language toggle). */
export const LOCALE_SHORT: Record<Locale, string> = {
  en: "EN",
  uk: "UA",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Best-effort match an Accept-Language header against our locale list. */
export function pickLocaleFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) {
    return DEFAULT_LOCALE;
  }
  const ordered = header
    .split(",")
    .map((entry) => {
      const [tag, ...rest] = entry.trim().split(";");
      const q = rest.find((r) => r.trim().startsWith("q="));
      const quality = q ? Number(q.split("=")[1]) : 1;
      return { tag: tag.toLowerCase(), quality: Number.isFinite(quality) ? quality : 1 };
    })
    .filter((e) => e.tag.length > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of ordered) {
    const base = tag.split("-")[0];
    if (isLocale(base)) {
      return base;
    }
  }
  return DEFAULT_LOCALE;
}

/** True when the browser's preferred language list includes Ukrainian. */
export function browserPrefersUkrainian(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const langs = navigator.languages?.length ? [...navigator.languages] : [navigator.language];
  return langs.some((tag) => tag.toLowerCase().startsWith("uk"));
}

export function hasExplicitLocaleChoice(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  return document.cookie.split(";").some((part) => part.trim() === `${LOCALE_EXPLICIT_COOKIE}=1`);
}
