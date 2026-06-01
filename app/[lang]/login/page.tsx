"use client";

import { useEffect, useState, type FormEvent } from "react";

import { AuthLayout } from "@/components/AuthLayout";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { LocaleLink, useLocaleRouter } from "@/lib/i18n/client";
import { ui } from "@/lib/ui";

export default function LoginPage() {
  const router = useLocaleRouter();
  const t = useTranslations();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return new URLSearchParams(window.location.search).get("auth_error") ?? "";
  });
  const [pending, setPending] = useState(false);

  /** Strip OAuth callback errors from the URL after showing them once. */
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (!params.get("auth_error")) {
      return;
    }
    params.delete("auth_error");
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? t("auth.login.failed"));
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.login.failed"));
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout
      eyebrow={t("auth.eyebrowTeacher")}
      title={t("auth.login.title")}
      subtitle={t("auth.login.subtitle")}
      footer={
        <p>
          {t("auth.login.newHerePrefix")}{" "}
          <LocaleLink href="/register" className={ui.link}>
            {t("auth.login.createAccount")}
          </LocaleLink>{" "}
          · {t("auth.login.studentsJoinSuffix")}{" "}
          <LocaleLink href="/join" className={ui.link}>
            {t("auth.login.joinPageLink")}
          </LocaleLink>
        </p>
      }
    >
      <div className="space-y-5">
        <GoogleSignInButton
          nextPath="/dashboard"
          label={t("auth.login.googleLabel")}
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
            {t("auth.login.emailLabel")}
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={ui.input}
              placeholder={t("auth.login.emailPlaceholder")}
            />
          </label>
          <label className={ui.label}>
            {t("auth.login.passwordLabel")}
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={ui.input}
            />
          </label>
          {error ? <p className={ui.alertError}>{error}</p> : null}
          <button type="submit" disabled={pending} className={`w-full ${ui.btnPrimary}`}>
            {pending ? t("auth.login.submitting") : t("auth.login.submit")}
          </button>
        </form>
      </div>
    </AuthLayout>
  );
}
