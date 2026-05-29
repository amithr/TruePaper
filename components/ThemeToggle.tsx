"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import { focusRing } from "@/lib/ui";

const OPTIONS = [
  { value: "light", labelKey: "theme.light" as const, icon: Sun },
  { value: "dark", labelKey: "theme.dark" as const, icon: Moon },
  { value: "system", labelKey: "theme.system" as const, icon: Monitor },
] as const;

type Props = {
  className?: string;
  /** Show text labels beside icons from the `sm` breakpoint up. */
  showLabels?: boolean;
};

export function ThemeToggle({ className, showLabels = false }: Props) {
  const t = useTranslations();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className={`tp-filter-bar h-[2.125rem] w-[6.75rem] ${className ?? ""}`}
        aria-hidden
      />
    );
  }

  return (
    <div className={`tp-filter-bar ${className ?? ""}`} role="group" aria-label={t("theme.label")}>
      {OPTIONS.map(({ value, labelKey, icon: Icon }) => {
        const active = theme === value;
        const label = t(labelKey);
        return (
          <button
            key={value}
            type="button"
            className={`tp-filter-chip ${focusRing}`}
            aria-pressed={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {showLabels ? <span className="hidden sm:inline">{label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
