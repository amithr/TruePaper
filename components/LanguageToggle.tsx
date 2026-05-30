"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  LOCALE_EXPLICIT_COOKIE,
  LOCALES,
  LOCALE_SHORT,
  type Locale,
} from "@/lib/i18n/config";
import { useLocale, useTranslations } from "@/lib/i18n/I18nProvider";
import { switchLocaleInPath } from "@/lib/i18n/navigation";
import { focusRing } from "@/lib/ui";

type Props = {
  className?: string;
};

/**
 * Compact two-button locale switcher (EN / UK). The active locale comes from
 * the I18nProvider so the rendered state matches SSR exactly — no hydration
 * guard needed. The locale cookie is written by the Proxy on the next request
 * once the URL contains the new locale prefix.
 */
export function LanguageToggle({ className }: Props) {
  const locale = useLocale();
  const t = useTranslations();
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

  return (
    <div
      className={`tp-filter-bar ${className ?? ""}`}
      role="group"
      aria-label={t("language.toggleAria")}
    >
      {LOCALES.map((code) => {
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            className={`tp-filter-chip ${focusRing}`}
            aria-pressed={active}
            aria-label={LOCALE_SHORT[code]}
            title={LOCALE_SHORT[code]}
            onClick={() => choose(code)}
          >
            <span className="text-[0.7rem] font-semibold tracking-wider">
              {LOCALE_SHORT[code]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
