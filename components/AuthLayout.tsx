"use client";

import { type ReactNode } from "react";

import { BrandMark } from "@/components/BrandMark";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { LocaleLink } from "@/lib/i18n/client";

type Props = {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthLayout({ eyebrow, title, subtitle, children, footer }: Props) {
  const t = useTranslations();
  return (
    <div className="grid min-h-screen grid-cols-1 bg-[var(--tp-bg)] lg:grid-cols-2">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              "linear-gradient(135deg, var(--tp-brand) 0%, var(--tp-sky) 60%, var(--tp-violet) 100%)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.4) 0, transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.25) 0, transparent 45%)",
          }}
        />
        <BrandMark size="lg" href="/" />
        <div className="space-y-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
            {t("brand.sidePanelEyebrow")}
          </p>
          <h2 className="text-3xl font-bold leading-tight">{t("brand.sidePanelTitle")}</h2>
          <ul className="space-y-2 text-sm text-white/90">
            <li className="flex items-start gap-2">
              <span aria-hidden className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-white" />
              {t("brand.sidePanelBullet1")}
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-white" />
              {t("brand.sidePanelBullet2")}
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-white" />
              {t("brand.sidePanelBullet3")}
            </li>
          </ul>
        </div>
        <p className="text-xs text-white/70">
          {t("brand.forTeachers")} ·{" "}
          <LocaleLink href="/#join-session" className="underline">
            {t("brand.studentsJoinFromPage")}
          </LocaleLink>
          .
        </p>
      </aside>

      {/* Form panel */}
      <main className="relative flex items-center justify-center p-6 sm:p-10">
        <div className="absolute right-4 top-4 sm:right-6 sm:top-6 flex items-center gap-2">
          <LanguageToggle />
          <ThemeToggle />
        </div>
        <div className="w-full max-w-md tp-anim-fade-up">
          <div className="lg:hidden mb-6">
            <BrandMark size="lg" href="/" />
          </div>
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--tp-text-muted)]">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--tp-text)]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 text-sm text-[var(--tp-text-secondary)]">{subtitle}</p>
          ) : null}
          <div className="mt-7">{children}</div>
          {footer ? (
            <div className="mt-6 text-sm text-[var(--tp-text-secondary)]">{footer}</div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
