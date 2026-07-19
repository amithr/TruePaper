"use client";

import type { ReactNode } from "react";

import { useTranslations } from "@/lib/i18n/I18nProvider";

type Props = {
  empty?: boolean;
  label?: string;
  children?: ReactNode;
  className?: string;
  /** Stronger border for primary answers (e.g. math final). */
  emphasis?: boolean;
  testId?: string;
};

/** Answer surface: solid when answered, dashed italic empty state when not. */
export function WatchResponseBox({
  empty,
  label,
  children,
  className = "",
  emphasis,
  testId,
}: Props) {
  const t = useTranslations();

  return (
    <div className={className}>
      {label ? <p className="tp-watch-response__label">{label}</p> : null}
      {empty ? (
        <div
          className={`tp-watch-response tp-watch-response--empty${emphasis ? " tp-watch-response--emphasis" : ""}`}
          data-testid={testId}
        >
          {t("session.watch.noResponse")}
        </div>
      ) : (
        <div
          className={`tp-watch-response${emphasis ? " tp-watch-response--emphasis" : ""}`}
          data-testid={testId}
        >
          {children}
        </div>
      )}
    </div>
  );
}
