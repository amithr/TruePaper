"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { Locale } from "@/lib/i18n/config";
import type { Dictionary, TranslationPath } from "@/lib/i18n/types";
import { interpolate } from "@/lib/i18n/types";

type Translator = (
  key: TranslationPath,
  vars?: Record<string, string | number>,
) => string;

type I18nValue = {
  locale: Locale;
  dict: Dictionary;
  t: Translator;
};

const I18nContext = createContext<I18nValue | null>(null);

type ProviderProps = {
  locale: Locale;
  dict: Dictionary;
  children: ReactNode;
};

export function I18nProvider({ locale, dict, children }: ProviderProps) {
  // `t` is memoised against `dict` so its identity is stable across renders.
  // Many components keep `t` in `useEffect` / `useCallback` dependency arrays
  // (e.g. for error-message fallbacks); a fresh function each render would
  // re-fire those effects on every render and infinite-loop the page.
  const value = useMemo<I18nValue>(() => {
    const t: Translator = (key, vars) => {
      const raw = readPath(dict, key);
      return vars ? interpolate(raw, vars) : raw;
    };
    return { locale, dict, t };
  }, [locale, dict]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used inside <I18nProvider>");
  }
  return ctx;
}

export function useLocale(): Locale {
  return useI18n().locale;
}

export function useDictionary(): Dictionary {
  return useI18n().dict;
}

/**
 * Returns a translator function bound to the current dictionary. Use dot
 * notation, e.g. `t("auth.login.title")`. Pass optional vars for `{placeholder}`.
 * The returned function is referentially stable for a given locale/dictionary,
 * so it is safe to list in `useEffect` / `useCallback` dependency arrays.
 */
export function useTranslations(): Translator {
  return useI18n().t;
}

function readPath(dict: Dictionary, key: string): string {
  const parts = key.split(".");
  let cursor: unknown = dict;
  for (const part of parts) {
    if (cursor && typeof cursor === "object" && part in (cursor as Record<string, unknown>)) {
      cursor = (cursor as Record<string, unknown>)[part];
    } else {
      cursor = undefined;
      break;
    }
  }
  if (typeof cursor === "string") {
    return cursor;
  }
  if (process.env.NODE_ENV !== "production") {
    return `[${key}]`;
  }
  return "";
}
