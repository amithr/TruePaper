"use client";

import {
  Check,
  CreditCard,
  Languages,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  User,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { AvatarUploader } from "@/components/settings/AvatarUploader";
import { SettingsSwitch } from "@/components/settings/SettingsSwitch";
import { TeacherTopBar } from "@/components/TeacherTopBar";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { useLocaleRouter } from "@/lib/i18n/client";
import type { TranslationPath } from "@/lib/i18n/types";
import { useSwitchLocale } from "@/lib/i18n/use-switch-locale";
import { isValidLiveSessionDisplayName, normalizeLiveSessionDisplayName } from "@/lib/live-session-display-name";
import type { DeliveryMode } from "@/lib/offline/config";
import { requestJson } from "@/lib/request-json";
import { avatarInitials } from "@/lib/teacher-avatar";
import {
  DURATION_PRESETS,
  RECOMMENDED_TEACHER_DEFAULTS,
  teacherDefaultsEqual,
  type TeacherDefaults,
} from "@/lib/teacher-defaults";
import { focusRing, ui } from "@/lib/ui";

export type TeacherSettingsProps = {
  user: { id: string; email: string };
  profile: { displayName: string; avatarUrl: string | null };
  defaults: TeacherDefaults;
  usage: { forms: number; sessions: number; students: number };
};

type SectionId = "profile" | "language" | "exam-defaults" | "plan" | "danger";

const SECTIONS: { id: SectionId; icon: typeof User; labelKey: TranslationPath }[] = [
  { id: "profile", icon: User, labelKey: "settings.nav.profile" },
  { id: "language", icon: Languages, labelKey: "settings.nav.language" },
  { id: "exam-defaults", icon: SlidersHorizontal, labelKey: "settings.nav.defaults" },
  { id: "plan", icon: CreditCard, labelKey: "settings.nav.plan" },
  { id: "danger", icon: TriangleAlert, labelKey: "settings.nav.danger" },
];

const DELIVERY_MODES: DeliveryMode[] = ["live", "self_paced", "hybrid"];
const DELIVERY_SHORT_KEY = {
  live: "formLibrary.deliveryLiveShort",
  self_paced: "formLibrary.deliverySelfPacedShort",
  hybrid: "formLibrary.deliveryHybridShort",
} as const;
const DELIVERY_HELP_KEY = {
  live: "formLibrary.deliveryLiveHelp",
  self_paced: "formLibrary.deliverySelfPacedHelp",
  hybrid: "formLibrary.deliveryHybridHelp",
} as const;

export function TeacherSettings({ user, profile, defaults: initialDefaults, usage }: TeacherSettingsProps) {
  const t = useTranslations();
  const router = useLocaleRouter();
  const { locale, choose: chooseLocale } = useSwitchLocale();

  // Profile
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [savedName, setSavedName] = useState(profile.displayName);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [error, setError] = useState("");

  // Exam defaults
  const [defaults, setDefaults] = useState<TeacherDefaults>(initialDefaults);
  const [savedDefaults, setSavedDefaults] = useState<TeacherDefaults>(initialDefaults);
  const [defaultsSaved, setDefaultsSaved] = useState(false);
  const [defaultsBusy, setDefaultsBusy] = useState(false);

  // Danger zone
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const deleteInputRef = useRef<HTMLInputElement>(null);

  // Sidebar nav follows the scroll position.
  const [active, setActive] = useState<SectionId>("profile");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) {
          setActive(hit.target.id as SectionId);
        }
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) {
        observer.observe(el);
      }
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (deleteOpen) {
      deleteInputRef.current?.focus();
    }
  }, [deleteOpen]);

  const name = normalizeLiveSessionDisplayName(displayName);
  const profileDirty = name !== savedName;
  const profileValid = isValidLiveSessionDisplayName(name);
  const initials = avatarInitials(savedName, user.email);
  const headingName = savedName || user.email.split("@")[0];

  const saveProfile = async () => {
    if (!profileDirty || !profileValid) {
      return;
    }
    setProfileBusy(true);
    setError("");
    try {
      await requestJson<{ ok: true }>("/api/teacher/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name }),
      });
      setSavedName(name);
      setDisplayName(name);
      setProfileSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("settings.profile.saveFailed"));
    } finally {
      setProfileBusy(false);
    }
  };

  const sendResetLink = async () => {
    setResetBusy(true);
    try {
      await requestJson<{ ok: true }>("/api/auth/password-reset", { method: "POST" });
      toast.success(t("settings.profile.resetSent"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("settings.profile.resetFailed"));
    } finally {
      setResetBusy(false);
    }
  };

  const defaultsDirty = !teacherDefaultsEqual(defaults, savedDefaults);
  const patchDefaults = (patch: Partial<TeacherDefaults>) => {
    setDefaults((prev) => ({ ...prev, ...patch }));
    setDefaultsSaved(false);
  };

  const saveDefaults = async () => {
    if (!defaultsDirty) {
      return;
    }
    setDefaultsBusy(true);
    setError("");
    try {
      await requestJson<{ ok: true }>("/api/teacher/defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(defaults),
      });
      setSavedDefaults(defaults);
      setDefaultsSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("settings.defaults.saveFailed"));
    } finally {
      setDefaultsBusy(false);
    }
  };

  const deleteWord = t("settings.danger.word");
  const deleteReady = deleteTyped.trim().toUpperCase() === deleteWord.toUpperCase();
  const deleteAccount = async () => {
    if (!deleteReady) {
      return;
    }
    setDeleting(true);
    setError("");
    try {
      await requestJson<{ ok: true }>("/api/teacher/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("settings.danger.failed"));
      setDeleting(false);
    }
  };

  const scrollTo = (id: SectionId) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const lateSyncApplies = defaults.deliveryMode === "live";

  return (
    <div className={ui.page}>
      <main className={`${ui.pageMain} space-y-6`}>
        <TeacherTopBar showStudentJoin={false} showSettings={false} />
        <Breadcrumbs
          items={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("settings.title") }]}
        />

        {error ? (
          <p className={ui.alertError} role="alert">
            {error}
          </p>
        ) : null}

        <div className="tp-settings-layout">
          <aside className="tp-settings-aside">
            <div className="tp-card-accent tp-settings-identity tp-anim-fade-up">
              <span className="tp-settings-identity__avatar" aria-hidden>
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Supabase public URL
                  <img src={avatarUrl} alt="" />
                ) : (
                  initials
                )}
              </span>
              <div className="min-w-0">
                <p className={ui.sectionTitle}>{t("settings.identity.eyebrow")}</p>
                <h1 className="tp-settings-identity__name">{headingName}</h1>
                <p className="tp-settings-identity__email">{user.email}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="tp-settings-badge tp-settings-badge--brand">
                  {t("settings.identity.roleTeacher")}
                </span>
                <span className="tp-settings-badge">{t("settings.identity.planFree")}</span>
              </div>
            </div>

            <nav aria-label={t("settings.nav.aria")} className="tp-settings-nav">
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                return (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className={`tp-settings-nav__item ${focusRing}`}
                    data-active={active === s.id ? "true" : undefined}
                    data-danger={s.id === "danger" ? "true" : undefined}
                    aria-current={active === s.id ? "location" : undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      scrollTo(s.id);
                    }}
                  >
                    <Icon aria-hidden className="h-4 w-4" />
                    {t(s.labelKey)}
                  </a>
                );
              })}
            </nav>
          </aside>

          <div className="tp-settings-sections">
            {/* Profile */}
            <section id="profile" className="tp-card tp-settings-section" aria-labelledby="settings-profile-title">
              <p className={ui.sectionTitle}>{t("settings.profile.eyebrow")}</p>
              <h2 id="settings-profile-title" className="tp-settings-section__title">
                {t("settings.profile.title")}
              </h2>

              <div className="tp-settings-section__rule">
                <AvatarUploader
                  initials={initials}
                  avatarUrl={avatarUrl}
                  onChange={(url) => {
                    setAvatarUrl(url);
                    router.refresh();
                  }}
                  onError={setError}
                />
              </div>

              <div className="tp-settings-fields">
                <label className={ui.label}>
                  {t("settings.profile.displayName")}
                  <input
                    type="text"
                    className={ui.input}
                    maxLength={120}
                    value={displayName}
                    placeholder={t("settings.profile.displayNamePlaceholder")}
                    onChange={(event) => {
                      setDisplayName(event.target.value);
                      setProfileSaved(false);
                    }}
                    data-testid="settings-display-name"
                  />
                  <span className="tp-settings-field-hint">{t("settings.profile.displayNameHint")}</span>
                </label>
                <label className={ui.label}>
                  {t("settings.profile.emailLabel")}
                  <input type="email" className={`${ui.input} tp-settings-input--readonly`} value={user.email} disabled />
                  <span className="tp-settings-field-hint">{t("settings.profile.emailHint")}</span>
                </label>
              </div>

              <div className="tp-settings-footer">
                <button
                  type="button"
                  className={ui.btnPrimary}
                  disabled={!profileDirty || !profileValid || profileBusy}
                  data-dirty={profileDirty ? "true" : undefined}
                  onClick={() => void saveProfile()}
                  data-testid="settings-save-profile"
                >
                  {t("settings.profile.saveChanges")}
                </button>
                {profileSaved ? (
                  <span className="tp-settings-saved" role="status">
                    <Check aria-hidden className="h-3.5 w-3.5" />
                    {t("settings.profile.saved")}
                  </span>
                ) : null}
                <span className="tp-settings-footer__note">
                  {t("settings.profile.passwordNote")}{" "}
                  <button
                    type="button"
                    className={ui.link}
                    disabled={resetBusy}
                    onClick={() => void sendResetLink()}
                  >
                    {t("settings.profile.passwordLink")}
                  </button>
                </span>
              </div>
            </section>

            {/* Language */}
            <section id="language" className="tp-card tp-settings-section" aria-labelledby="settings-language-title">
              <p className={ui.sectionTitle}>{t("settings.language.eyebrow")}</p>
              <h2 id="settings-language-title" className="tp-settings-section__title">
                {t("settings.language.title")}
              </h2>
              <div className="tp-settings-fields mt-5" role="radiogroup" aria-labelledby="settings-language-title">
                {LOCALES.map((code: Locale) => {
                  const selected = code === locale;
                  return (
                    <button
                      key={code}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`tp-settings-lang ${focusRing}`}
                      data-active={selected ? "true" : undefined}
                      onClick={() => chooseLocale(code)}
                    >
                      <span className="tp-settings-lang__radio" aria-hidden>
                        <span />
                      </span>
                      <span>
                        <span className="block text-[0.9375rem] font-semibold">{LOCALE_LABELS[code]}</span>
                        <span className="mt-0.5 block text-[0.8125rem] text-[var(--tp-text-secondary)]">
                          {t(code === "en" ? "settings.language.enHint" : "settings.language.ukHint")}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3.5 text-[0.8125rem] text-[var(--tp-text-muted)]">{t("settings.language.note")}</p>
            </section>

            {/* Exam defaults */}
            <section id="exam-defaults" className="tp-card tp-settings-section" aria-labelledby="settings-defaults-title">
              <p className={ui.sectionTitle}>{t("settings.defaults.eyebrow")}</p>
              <h2 id="settings-defaults-title" className="tp-settings-section__title">
                {t("settings.defaults.title")}
              </h2>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[var(--tp-text-secondary)]">
                {t("settings.defaults.sub")}
              </p>

              <div className="tp-settings-rules">
                <div className="tp-settings-row tp-settings-row--top">
                  <div>
                    <p className="tp-settings-row__label" id="settings-duration-label">
                      {t("settings.defaults.durationLabel")}
                    </p>
                    <p className="tp-settings-row__hint">{t("settings.defaults.durationHint")}</p>
                  </div>
                  <div className="tp-form-library-chips justify-end" role="radiogroup" aria-labelledby="settings-duration-label">
                    {DURATION_PRESETS.map((minutes) => {
                      const on = defaults.durationMinutes === minutes;
                      return (
                        <button
                          key={minutes}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          data-active={on ? "true" : undefined}
                          className={`tp-form-library-chip ${focusRing}`}
                          onClick={() => patchDefaults({ durationMinutes: minutes })}
                        >
                          {t("formLibrary.startPopover.minutesChip", { n: minutes })}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={defaults.durationMinutes === null}
                      data-active={defaults.durationMinutes === null ? "true" : undefined}
                      className={`tp-form-library-chip ${focusRing}`}
                      onClick={() => patchDefaults({ durationMinutes: null })}
                    >
                      {t("common.noLimit")}
                    </button>
                  </div>
                </div>

                <div className="tp-settings-row tp-settings-row--top">
                  <div>
                    <p className="tp-settings-row__label" id="settings-delivery-label">
                      {t("settings.defaults.deliveryLabel")}
                    </p>
                    <p className="tp-settings-row__hint">{t(DELIVERY_HELP_KEY[defaults.deliveryMode])}</p>
                  </div>
                  <div className="tp-form-library-segments tp-settings-segments" role="radiogroup" aria-labelledby="settings-delivery-label">
                    {DELIVERY_MODES.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={defaults.deliveryMode === mode}
                        data-active={defaults.deliveryMode === mode ? "true" : undefined}
                        className="tp-form-library-segment"
                        onClick={() => patchDefaults({ deliveryMode: mode })}
                      >
                        {t(DELIVERY_SHORT_KEY[mode])}
                      </button>
                    ))}
                  </div>
                </div>

                <SettingsSwitch
                  id="settings-late-sync"
                  label={t("settings.defaults.lateSyncLabel")}
                  hint={t("settings.defaults.lateSyncHint")}
                  checked={defaults.acceptLateSync}
                  dimmed={!lateSyncApplies}
                  onChange={(next) => patchDefaults({ acceptLateSync: next })}
                />
                <SettingsSwitch
                  id="settings-live-feedback"
                  label={t("settings.defaults.feedbackLabel")}
                  hint={t("settings.defaults.feedbackHint")}
                  checked={defaults.liveFeedback}
                  onChange={(next) => patchDefaults({ liveFeedback: next })}
                />
                <SettingsSwitch
                  id="settings-block-paste"
                  label={t("settings.defaults.pasteLabel")}
                  hint={t("settings.defaults.pasteHint")}
                  checked
                  locked
                />
                <SettingsSwitch
                  id="settings-tab-leave"
                  label={t("settings.defaults.tabLeaveLabel")}
                  hint={t("settings.defaults.tabLeaveHint")}
                  checked
                  locked
                />
              </div>

              <div className="tp-settings-footer tp-settings-footer--plain">
                <button
                  type="button"
                  className={ui.btnPrimary}
                  disabled={!defaultsDirty || defaultsBusy}
                  data-dirty={defaultsDirty ? "true" : undefined}
                  onClick={() => void saveDefaults()}
                  data-testid="settings-save-defaults"
                >
                  {t("settings.defaults.save")}
                </button>
                <button
                  type="button"
                  className={ui.btnGhost}
                  onClick={() => patchDefaults({ ...RECOMMENDED_TEACHER_DEFAULTS })}
                >
                  {t("settings.defaults.reset")}
                </button>
                {defaultsSaved ? (
                  <span className="tp-settings-saved" role="status">
                    <Check aria-hidden className="h-3.5 w-3.5" />
                    {t("settings.defaults.saved")}
                  </span>
                ) : null}
                <span className="tp-settings-footer__note">{t("settings.defaults.footnote")}</span>
              </div>
            </section>

            {/* Plan & usage */}
            <section id="plan" className="tp-card tp-settings-section" aria-labelledby="settings-plan-title">
              <div className="tp-settings-plan">
                <div>
                  <p className={ui.sectionTitle}>{t("settings.plan.eyebrow")}</p>
                  <h2 id="settings-plan-title" className="tp-settings-section__title flex flex-wrap items-center gap-2.5">
                    {t("settings.plan.title")}
                    <span className="tp-settings-badge tp-settings-badge--mint">{t("settings.plan.active")}</span>
                  </h2>
                  <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-[var(--tp-text-secondary)]">
                    {t("settings.plan.sub")}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button type="button" className={ui.btnSecondary} disabled>
                      {t("settings.plan.upgrade")}
                    </button>
                    <span className="text-[0.8125rem] text-[var(--tp-text-muted)]">{t("settings.plan.comingSoon")}</span>
                  </div>
                </div>
                <dl className="tp-soft-panel tp-settings-usage">
                  <div>
                    <dd>{usage.forms}</dd>
                    <dt>{t("settings.plan.usageForms")}</dt>
                  </div>
                  <div>
                    <dd>{usage.sessions}</dd>
                    <dt>{t("settings.plan.usageSessions")}</dt>
                  </div>
                  <div>
                    <dd>{usage.students}</dd>
                    <dt>{t("settings.plan.usageStudents")}</dt>
                  </div>
                </dl>
              </div>
            </section>

            {/* Danger zone */}
            <section id="danger" className="tp-card tp-settings-section tp-settings-section--danger" aria-labelledby="settings-danger-title">
              <p className={`${ui.sectionTitle} tp-settings-kicker--danger`}>{t("settings.danger.eyebrow")}</p>
              <div className="tp-settings-row tp-settings-row--plain">
                <div>
                  <h2 id="settings-danger-title" className="text-[1.0625rem] font-semibold tracking-tight">
                    {t("settings.danger.deleteTitle")}
                  </h2>
                  <p className="mt-1 max-w-2xl text-[0.8125rem] leading-snug text-[var(--tp-text-secondary)]">
                    {t("settings.danger.deleteSub")}
                  </p>
                </div>
                <button
                  type="button"
                  className={ui.btnDanger}
                  onClick={() => setDeleteOpen(true)}
                  disabled={deleteOpen}
                  data-testid="settings-delete-open"
                >
                  <Trash2 aria-hidden className="h-3.5 w-3.5" />
                  {t("settings.danger.deleteCta")}
                </button>
              </div>

              {deleteOpen ? (
                <div
                  role="alertdialog"
                  aria-labelledby="settings-danger-title"
                  aria-describedby="settings-delete-body"
                  className="tp-settings-delete"
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setDeleteOpen(false);
                      setDeleteTyped("");
                    }
                  }}
                >
                  <p id="settings-delete-body" className="text-sm leading-relaxed">
                    {t("settings.danger.confirmBody")}
                  </p>
                  <ul className="list-disc pl-5 text-[0.8125rem] leading-relaxed">
                    <li>{t("settings.danger.bullet1")}</li>
                    <li>{t("settings.danger.bullet2")}</li>
                    <li>{t("settings.danger.bullet3")}</li>
                  </ul>
                  <label className="block text-[0.8125rem] font-medium">
                    {t("settings.danger.typePrompt", { word: deleteWord })}
                    <input
                      ref={deleteInputRef}
                      type="text"
                      className={`${ui.input} tp-settings-delete__input`}
                      value={deleteTyped}
                      placeholder={deleteWord}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) => setDeleteTyped(event.target.value)}
                      data-testid="settings-delete-word"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={`tp-settings-delete__confirm ${focusRing}`}
                      disabled={!deleteReady || deleting}
                      onClick={() => void deleteAccount()}
                      data-testid="settings-delete-confirm"
                    >
                      {deleting ? t("settings.danger.deleting") : t("settings.danger.confirmCta")}
                    </button>
                    <button
                      type="button"
                      className={ui.btnSecondary}
                      disabled={deleting}
                      onClick={() => {
                        setDeleteOpen(false);
                        setDeleteTyped("");
                      }}
                    >
                      {t("settings.danger.cancel")}
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
