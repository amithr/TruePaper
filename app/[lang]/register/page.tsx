"use client";

import { useMemo, useState, type FormEvent } from "react";

import { AuthLayout } from "@/components/AuthLayout";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { LocaleLink, useLocaleRouter } from "@/lib/i18n/client";
import {
  isValidLiveSessionDisplayName,
  normalizeLiveSessionDisplayName,
} from "@/lib/live-session-display-name";
import {
  getPasswordRequirementLabels,
  getPasswordRequirementStatus,
  isPasswordStrong,
  validatePasswordStrength,
} from "@/lib/password-policy";
import { ui } from "@/lib/ui";

const REQUIREMENT_ROWS = getPasswordRequirementLabels();

function passwordInputClass(met: boolean): string {
  if (met) {
    return `${ui.input} border-[var(--tp-success)] shadow-[0_0_0_3px_var(--tp-success-soft)]`;
  }
  return ui.input;
}

export default function RegisterPage() {
  const router = useLocaleRouter();
  const t = useTranslations();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [pending, setPending] = useState(false);

  const requirementStatus = useMemo(() => getPasswordRequirementStatus(password), [password]);
  const passwordRequirementsMet = useMemo(() => isPasswordStrong(password), [password]);

  const confirmPasswordRequirementsMet = useMemo(
    () => passwordRequirementsMet && confirmPassword.length > 0 && password === confirmPassword,
    [passwordRequirementsMet, confirmPassword, password],
  );

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setInfo("");

    if (password !== confirmPassword) {
      setError(t("auth.register.passwordsDoNotMatch"));
      return;
    }

    const strengthError = validatePasswordStrength(password);
    if (strengthError) {
      setError(strengthError);
      return;
    }

    const name = normalizeLiveSessionDisplayName(displayName);
    if (!isValidLiveSessionDisplayName(name)) {
      setError(t("auth.register.enterName"));
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          confirmPassword,
          displayName: name,
        }),
      });
      const data = (await response.json()) as { error?: string; needsEmailConfirmation?: boolean };
      if (!response.ok) {
        throw new Error(data.error ?? t("auth.register.failed"));
      }
      if (data.needsEmailConfirmation) {
        setInfo(t("auth.register.needsEmailConfirmation"));
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.register.failed"));
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout
      eyebrow={t("auth.eyebrowTeacher")}
      title={t("auth.register.title")}
      subtitle={t("auth.register.subtitle")}
      footer={
        <p>
          {t("auth.register.alreadyHaveAccountPrefix")}{" "}
          <LocaleLink href="/login" className={ui.link}>
            {t("auth.register.signIn")}
          </LocaleLink>{" "}
          · {t("auth.register.studentsJoinSuffix")}{" "}
          <LocaleLink href="/join" className={ui.link}>
            {t("auth.register.joinPageLink")}
          </LocaleLink>
        </p>
      }
    >
      <div className="space-y-5">
        <GoogleSignInButton
          nextPath="/dashboard"
          label={t("auth.register.googleLabel")}
          disabled={pending}
          onError={(message) => setError(message)}
        />
        <div
          className="flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-[var(--tp-text-muted)]"
          aria-hidden
        >
          <span className="h-px flex-1 bg-[var(--tp-border)]" />
          <span>{t("common.or")}</span>
          <span className="h-px flex-1 bg-[var(--tp-border)]" />
        </div>
        <form className="space-y-5" onSubmit={onSubmit}>
          <label className={ui.label}>
            {t("auth.register.nameLabel")}
            <input
              type="text"
              autoComplete="name"
              required
              spellCheck={false}
              maxLength={120}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={ui.input}
              placeholder={t("auth.register.namePlaceholder")}
            />
          </label>
          <label className={ui.label}>
            {t("auth.register.emailLabel")}
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={ui.input}
            />
          </label>
          <div>
            <label className={ui.label}>
              {t("auth.register.passwordLabel")}
              <input
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={passwordInputClass(passwordRequirementsMet)}
                aria-invalid={password.length > 0 && !passwordRequirementsMet}
              />
            </label>
            <ul className="mt-2 space-y-1.5 text-sm" aria-live="polite">
              {REQUIREMENT_ROWS.map(({ key, label }) => {
                const met = requirementStatus[key];
                return (
                  <li
                    key={key}
                    className={`flex items-center gap-2 ${met ? "text-[var(--tp-success)]" : "text-[var(--tp-text-muted)]"}`}
                  >
                    <span
                      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                        met
                          ? "border-green-600 bg-green-50 text-green-700"
                          : "border-zinc-300 bg-zinc-50 text-zinc-400"
                      }`}
                      aria-hidden
                    >
                      {met ? "✓" : "·"}
                    </span>
                    {label}
                  </li>
                );
              })}
            </ul>
          </div>
          <label className={ui.label}>
            {t("auth.register.confirmPasswordLabel")}
            <input
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={passwordInputClass(confirmPasswordRequirementsMet)}
              aria-invalid={confirmPassword.length > 0 && !confirmPasswordRequirementsMet}
            />
            {confirmPassword.length > 0 && !confirmPasswordRequirementsMet ? (
              <p className="mt-1 text-xs text-zinc-500">
                {passwordRequirementsMet
                  ? t("auth.register.confirmMustMatch")
                  : t("auth.register.confirmMeetRequirements")}
              </p>
            ) : null}
          </label>
          {error ? <p className={ui.alertError}>{error}</p> : null}
          {info ? <p className={ui.alertSuccess}>{info}</p> : null}
          <button type="submit" disabled={pending} className={`w-full ${ui.btnPrimary}`}>
            {pending ? t("auth.register.submitting") : t("auth.register.submit")}
          </button>
        </form>
      </div>
    </AuthLayout>
  );
}
