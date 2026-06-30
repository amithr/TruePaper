"use client";

import { BrandMark } from "@/components/BrandMark";
import { HelpTipsToggle } from "@/components/HelpTipsToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { LocaleLink, useLocaleRouter } from "@/lib/i18n/client";
import { requestJson } from "@/lib/request-json";
import { focusRing, ui } from "@/lib/ui";

type Props = {
  /** Hide the "Student join" shortcut (e.g. on screens where it's redundant). */
  showStudentJoin?: boolean;
};

/**
 * Persistent teacher chrome (brand left, global actions right) shared across the
 * dashboard, live session, and watch screens so the top bar never disappears as
 * the teacher drills in. Page-specific actions live in the page header below this.
 */
export function TeacherTopBar({ showStudentJoin = true }: Props) {
  const t = useTranslations();
  const router = useLocaleRouter();

  const logout = async () => {
    await requestJson<{ ok: true }>("/api/auth/logout", { method: "POST" });
    router.replace("/");
    router.refresh();
  };

  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <BrandMark href="/dashboard" />
      <div className="flex items-center gap-2">
        <HelpTipsToggle />
        <LanguageToggle />
        {showStudentJoin ? (
          <LocaleLink
            href="/join"
            className={`${ui.btnSecondary} hidden sm:inline-flex`}
            aria-label={t("dashboard.studentJoinPageAria")}
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
              <path d="M3 12h12" />
              <path d="m11 6 6 6-6 6" />
            </svg>
            {t("nav.studentJoin")}
          </LocaleLink>
        ) : null}
        <button
          type="button"
          onClick={() => void logout()}
          className={`tp-pill ${focusRing}`}
          aria-label={t("dashboard.logOutAria")}
          title={t("common.logOut")}
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
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="m16 17 5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
          <span className="hidden text-sm sm:inline">{t("common.logOut")}</span>
        </button>
      </div>
    </header>
  );
}
