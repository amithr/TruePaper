"use client";

import { LEGAL } from "@/lib/legal/constants";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { LocaleLink } from "@/lib/i18n/client";

export function SiteFooter() {
  const t = useTranslations();
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-[var(--tp-border)] bg-[var(--tp-surface)]">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-4 px-4 py-6 text-sm text-[var(--tp-text-muted)] sm:flex-row sm:px-6">
        <nav aria-label={t("legal.footerNavLabel")} className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <LocaleLink href="/privacy" className="underline-offset-2 hover:text-[var(--tp-text)] hover:underline">
            {t("legal.privacy")}
          </LocaleLink>
          <LocaleLink href="/terms" className="underline-offset-2 hover:text-[var(--tp-text)] hover:underline">
            {t("legal.terms")}
          </LocaleLink>
          <LocaleLink href="/cookies" className="underline-offset-2 hover:text-[var(--tp-text)] hover:underline">
            {t("legal.cookies")}
          </LocaleLink>
        </nav>
        <p className="text-center sm:text-right">
          {t("legal.copyright", { year: String(year), company: LEGAL.companyName })}
        </p>
      </div>
    </footer>
  );
}
