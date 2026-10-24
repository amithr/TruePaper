"use client";

import { useState, type FormEvent } from "react";

import { AuthLayout } from "@/components/AuthLayout";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { LocaleLink, useLocaleRouter } from "@/lib/i18n/client";
import { ui } from "@/lib/ui";

/** Landing page for the password-recovery email (Settings → "Send a reset link"). */
export default function ResetPasswordPage() {
  const router = useLocaleRouter();
  const t = useTranslations();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmPassword }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(
          response.status === 401 ? t("auth.resetPassword.expired") : (data.error ?? t("auth.resetPassword.failed")),
        );
      }
      setDone(true);
      window.setTimeout(() => {
        router.replace("/dashboard");
        router.refresh();
      }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.resetPassword.failed"));
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout
      eyebrow={t("auth.eyebrowTeacher")}
      title={t("auth.resetPassword.title")}
      subtitle={t("auth.resetPassword.subtitle")}
      footer={
        <p>
          <LocaleLink href="/login" className={ui.link}>
            {t("auth.login.title")}
          </LocaleLink>
        </p>
      }
    >
      <form className="space-y-5" onSubmit={onSubmit}>
        <label className={ui.label}>
          {t("auth.resetPassword.newPassword")}
          <input
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={ui.input}
          />
        </label>
        <label className={ui.label}>
          {t("auth.resetPassword.confirmPassword")}
          <input
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={ui.input}
          />
        </label>
        {error ? <p className={ui.alertError}>{error}</p> : null}
        {done ? <p className={ui.alertSuccess}>{t("auth.resetPassword.success")}</p> : null}
        <button type="submit" disabled={pending || done} className={`w-full ${ui.btnPrimary}`}>
          {pending ? t("auth.resetPassword.submitting") : t("auth.resetPassword.submit")}
        </button>
      </form>
    </AuthLayout>
  );
}
