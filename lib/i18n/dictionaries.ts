import "server-only";

import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/types";

const loaders: Record<Locale, () => Promise<Dictionary>> = {
  en: () => import("@/messages/en.json").then((mod) => mod.default as Dictionary),
  uk: () => import("@/messages/uk.json").then((mod) => mod.default as Dictionary),
};

const dictionaryCache = new Map<Locale, Dictionary>();

/** Server-side dictionary loader. Memoised per-locale within a single request. */
export async function getDictionary(localeInput: string | undefined | null): Promise<Dictionary> {
  const locale: Locale = isLocale(localeInput) ? localeInput : DEFAULT_LOCALE;
  const cached = dictionaryCache.get(locale);
  if (cached) {
    return cached;
  }
  const dict = await loaders[locale]();
  dictionaryCache.set(locale, dict);
  return dict;
}

export function resolveLocale(localeInput: string | undefined | null): Locale {
  return isLocale(localeInput) ? localeInput : DEFAULT_LOCALE;
}
