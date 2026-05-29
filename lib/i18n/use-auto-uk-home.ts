"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import {
  browserPrefersUkrainian,
  hasExplicitLocaleChoice,
  type Locale,
} from "@/lib/i18n/config";
import { useLocale } from "@/lib/i18n/I18nProvider";
import { stripLocale, switchLocaleInPath } from "@/lib/i18n/navigation";

/**
 * On the localized home page only, redirect to Ukrainian when the browser
 * prefers it and the user has not explicitly chosen another locale.
 */
export function useAutoUkrainianHome() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (locale === "uk") {
      return;
    }
    const { rest } = stripLocale(pathname ?? "/");
    if (rest !== "/") {
      return;
    }
    if (hasExplicitLocaleChoice() || !browserPrefersUkrainian()) {
      return;
    }
    const search = typeof window !== "undefined" ? window.location.search : "";
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const target = switchLocaleInPath((pathname ?? `/${locale}`) + search + hash, "uk" satisfies Locale);
    router.replace(target);
    router.refresh();
  }, [locale, pathname, router]);
}
