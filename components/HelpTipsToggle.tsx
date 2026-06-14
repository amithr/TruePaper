"use client";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import { useHelpPrefs } from "@/lib/use-help-prefs";
import { focusRing } from "@/lib/ui";

type Props = {
  className?: string;
};

/** Teacher control to show/hide the ambient onboarding hint triggers (HelpHint). */
export function HelpTipsToggle({ className = "" }: Props) {
  const t = useTranslations();
  const { ready, hintsEnabled, toggleHints } = useHelpPrefs();

  if (!ready) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={toggleHints}
      className={`tp-pill ${focusRing} ${className}`.trim()}
      aria-pressed={hintsEnabled}
      aria-label={t("help.toggle.aria")}
    >
      <svg
        aria-hidden
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 18h6M10 21h4" />
        <path d="M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.4 1 2.5h6c0-1.1.4-1.9 1-2.5A6 6 0 0 0 12 3z" />
      </svg>
      <span className="hidden text-sm sm:inline">
        {hintsEnabled ? t("help.toggle.hide") : t("help.toggle.show")}
      </span>
    </button>
  );
}
