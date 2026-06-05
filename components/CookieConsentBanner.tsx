"use client";

import { useCallback, useEffect, useState } from "react";

import {
  acceptAllCookies,
  readCookieConsent,
  rejectNonEssentialCookies,
  writeCookieConsent,
  type CookieConsentChoice,
} from "@/lib/cookie-consent";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { LocaleLink } from "@/lib/i18n/client";
import { focusRing, ui } from "@/lib/ui";

export function CookieConsentBanner() {
  const t = useTranslations();
  const [choice, setChoice] = useState<CookieConsentChoice | null | undefined>(undefined);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [draftAnalytics, setDraftAnalytics] = useState(false);
  const [draftMarketing, setDraftMarketing] = useState(false);

  const syncFromStorage = useCallback(() => {
    setChoice(readCookieConsent());
  }, []);

  useEffect(() => {
    syncFromStorage();
    const onChange = () => syncFromStorage();
    window.addEventListener("tp-cookie-consent-change", onChange);
    return () => window.removeEventListener("tp-cookie-consent-change", onChange);
  }, [syncFromStorage]);

  const openPreferences = () => {
    const current = readCookieConsent();
    setDraftAnalytics(current?.analytics ?? false);
    setDraftMarketing(current?.marketing ?? false);
    setPrefsOpen(true);
  };

  const savePreferences = () => {
    const saved = writeCookieConsent({
      analytics: draftAnalytics,
      marketing: draftMarketing,
    });
    setChoice(saved);
    setPrefsOpen(false);
  };

  if (choice === undefined) {
    return null;
  }

  if (choice !== null && !prefsOpen) {
    return null;
  }

  return (
    <>
      <div
        className="tp-cookie-banner fixed inset-x-0 bottom-0 z-50 border-t border-[var(--tp-border)] bg-[var(--tp-surface)] px-4 py-4 shadow-[var(--tp-shadow-lg)] sm:px-6"
        role="dialog"
        aria-labelledby="tp-cookie-banner-title"
        aria-describedby="tp-cookie-banner-desc"
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <p id="tp-cookie-banner-title" className="text-sm font-semibold text-[var(--tp-text)]">
              {t("cookieConsent.title")}
            </p>
            <p id="tp-cookie-banner-desc" className="mt-1 text-sm leading-relaxed text-[var(--tp-text-secondary)]">
              {t("cookieConsent.description")}{" "}
              <LocaleLink href="/cookies" className={ui.link}>
                {t("legal.cookies")}
              </LocaleLink>
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              className={`${ui.btnSecondary} text-sm ${focusRing}`}
              onClick={() => {
                setChoice(rejectNonEssentialCookies());
                setPrefsOpen(false);
              }}
            >
              {t("cookieConsent.rejectNonEssential")}
            </button>
            <button
              type="button"
              className={`${ui.btnSecondary} text-sm ${focusRing}`}
              onClick={openPreferences}
            >
              {t("cookieConsent.manage")}
            </button>
            <button
              type="button"
              className={`${ui.btnPrimary} text-sm ${focusRing}`}
              onClick={() => {
                setChoice(acceptAllCookies());
                setPrefsOpen(false);
              }}
            >
              {t("cookieConsent.acceptAll")}
            </button>
          </div>
        </div>
      </div>

      {prefsOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="presentation"
          onClick={() => setPrefsOpen(false)}
        >
          <div
            className="tp-card w-full max-w-md p-6 shadow-[var(--tp-shadow-lg)]"
            role="dialog"
            aria-labelledby="tp-cookie-prefs-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="tp-cookie-prefs-title" className="text-lg font-semibold text-[var(--tp-text)]">
              {t("cookieConsent.prefsTitle")}
            </h2>
            <p className="mt-2 text-sm text-[var(--tp-text-secondary)]">
              {t("cookieConsent.prefsDescription")}
            </p>
            <ul className="mt-5 space-y-4">
              <li className="rounded-[var(--tp-radius-xs)] border border-[var(--tp-border)] px-4 py-3">
                <p className="text-sm font-semibold text-[var(--tp-text)]">
                  {t("cookieConsent.categoryEssential")}
                </p>
                <p className="mt-1 text-xs text-[var(--tp-text-muted)]">
                  {t("cookieConsent.categoryEssentialDesc")}
                </p>
                <p className="mt-2 text-xs font-medium text-[var(--tp-text-muted)]">
                  {t("cookieConsent.alwaysOn")}
                </p>
              </li>
              <li className="rounded-[var(--tp-radius-xs)] border border-[var(--tp-border)] px-4 py-3">
                <label className="flex cursor-pointer items-start justify-between gap-3">
                  <span>
                    <span className="text-sm font-semibold text-[var(--tp-text)]">
                      {t("cookieConsent.categoryAnalytics")}
                    </span>
                    <span className="mt-1 block text-xs text-[var(--tp-text-muted)]">
                      {t("cookieConsent.categoryAnalyticsDesc")}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-[var(--tp-border)]"
                    checked={draftAnalytics}
                    onChange={(e) => setDraftAnalytics(e.target.checked)}
                  />
                </label>
              </li>
              <li className="rounded-[var(--tp-radius-xs)] border border-[var(--tp-border)] px-4 py-3">
                <label className="flex cursor-pointer items-start justify-between gap-3">
                  <span>
                    <span className="text-sm font-semibold text-[var(--tp-text)]">
                      {t("cookieConsent.categoryMarketing")}
                    </span>
                    <span className="mt-1 block text-xs text-[var(--tp-text-muted)]">
                      {t("cookieConsent.categoryMarketingDesc")}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-[var(--tp-border)]"
                    checked={draftMarketing}
                    onChange={(e) => setDraftMarketing(e.target.checked)}
                  />
                </label>
              </li>
            </ul>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className={`${ui.btnSecondary} ${focusRing}`}
                onClick={() => setPrefsOpen(false)}
              >
                {t("common.cancel")}
              </button>
              <button type="button" className={`${ui.btnPrimary} ${focusRing}`} onClick={savePreferences}>
                {t("cookieConsent.savePreferences")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
