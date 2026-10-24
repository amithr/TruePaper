"use client";

import { LOCALES, LOCALE_SHORT } from "@/lib/i18n/config";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { useSwitchLocale } from "@/lib/i18n/use-switch-locale";
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
  const t = useTranslations();
  const { locale, choose } = useSwitchLocale();

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
