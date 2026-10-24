"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { LOCALE_EXPLICIT_COOKIE, type Locale } from "@/lib/i18n/config";
import { useLocale } from "@/lib/i18n/I18nProvider";
import { switchLocaleInPath } from "@/lib/i18n/navigation";

/**
 * Switch the UI locale in place: rewrites the current URL's locale prefix and
 * marks the choice explicit (cookie) so auto-detection stops overriding it.
 * Shared by the top-bar toggle and Settings → Language.
 */
export function useSwitchLocale(): { locale: Locale; choose: (next: Locale) => void } {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [explicitLocaleCookieTick, setExplicitLocaleCookieTick] = useState(0);

  useEffect(() => {
    if (explicitLocaleCookieTick === 0) {
      return;
    }
    document.cookie = `${LOCALE_EXPLICIT_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [explicitLocaleCookieTick]);

  const choose = (next: Locale) => {
    if (next === locale) {
      return;
    }
    setExplicitLocaleCookieTick((tick) => tick + 1);
    const search = typeof window !== "undefined" ? window.location.search : "";
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const target = switchLocaleInPath((pathname ?? `/${locale}`) + search + hash, next);
    startTransition(() => {
      router.replace(target);
      router.refresh();
    });
  };

  return { locale, choose };
}
