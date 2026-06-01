"use client";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import { LocaleLink } from "@/lib/i18n/client";

type Props = {
  size?: "default" | "lg";
  href?: string | null;
  showText?: boolean;
  /** White wordmark for gradient / dark panels (e.g. auth side panel). */
  variant?: "default" | "onDark";
  className?: string;
};

export function BrandMark({
  size = "default",
  href = "/",
  showText = true,
  variant = "default",
  className,
}: Props) {
  const t = useTranslations();
  const inner = (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <span
        aria-hidden
        className={size === "lg" ? "tp-brand-mark tp-brand-mark--lg" : "tp-brand-mark"}
      >
        T
      </span>
      {showText ? (
        <span
          className={`text-base font-bold tracking-tight sm:text-lg ${
            variant === "onDark" ? "text-white" : "text-[var(--tp-text)]"
          }`}
        >
          {t("common.appName")}
        </span>
      ) : null}
    </span>
  );

  if (!href) {
    return inner;
  }

  return (
    <LocaleLink
      href={href}
      className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tp-accent-ring)] focus-visible:ring-offset-2 rounded-md"
    >
      {inner}
    </LocaleLink>
  );
}
