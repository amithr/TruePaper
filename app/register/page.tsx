"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

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
import { buttonLabel, ui } from "@/lib/ui";

const REQUIREMENT_ROWS = getPasswordRequirementLabels();

function passwordInputClass(met: boolean): string {
  if (met) {
    return `${ui.input} border-[var(--tp-success)] shadow-[0_0_0_3px_var(--tp-success-soft)]`;
  }
  return ui.input;
}

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [pending, setPending] = useState(false);

  const requirementStatus = useMemo(() => getPasswordRequirementStatus(password), [password]);
  const passwordRequirementsMet = useMemo(
    () => isPasswordStrong(password),
    [password],
  );

  const confirmPasswordRequirementsMet = useMemo(
    () => passwordRequirementsMet && confirmPassword.length > 0 && password === confirmPassword,
    [passwordRequirementsMet, confirmPassword, password],
  );

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setInfo("");

    if (password !== confirmPassword) {
      setError("Password and confirm password do not match.");
      return;
    }

    const strengthError = validatePasswordStrength(password);
    if (strengthError) {
      setError(strengthError);
      return;
    }

    const name = normalizeLiveSessionDisplayName(displayName);
    if (!isValidLiveSessionDisplayName(name)) {
      setError("Enter your name (1–120 characters).");
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
        throw new Error(data.error ?? "Registration failed.");
      }
      if (data.needsEmailConfirmation) {
        setInfo("Check your email to confirm your account, then log in.");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={ui.page}>
      <main className={`${ui.pageMainNarrow} tp-card p-8 sm:p-10`}>
        <p className={ui.sectionTitle}>Teacher account</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Create account</h1>
        <p className="mt-2 text-sm text-[var(--tp-text-secondary)]">
          Students can fill out forms without an account. This page is for teachers who build forms.
        </p>
        <p className="mt-2 text-sm text-[var(--tp-text-secondary)]">
          Already have an account?{" "}
          <Link href="/login" className={ui.link}>
            Log in
          </Link>
        </p>
        <p className="mt-3 text-sm text-[var(--tp-text-secondary)]">
          Joining a class with a code?{" "}
          <Link href="/#join-session" className={ui.link}>
            Student join
          </Link>
        </p>

        <form className="mt-8 space-y-5" onSubmit={onSubmit}>
          <label className={ui.label}>
            Your name
            <input
              type="text"
              autoComplete="name"
              required
              spellCheck={false}
              maxLength={120}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={ui.input}
              placeholder="e.g. Alex Morgan"
            />
          </label>
          <label className={ui.label}>
            Email
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
              Password
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
            Confirm password
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
                  ? "Must match the password above exactly."
                  : "Meet all password requirements above first, then match that password."}
              </p>
            ) : null}
          </label>
          {error ? <p className={ui.alertError}>{error}</p> : null}
          {info ? <p className={ui.alertSuccess}>{info}</p> : null}
          <button type="submit" disabled={pending} className={`w-full ${ui.btnPrimary}`}>
            {pending ? buttonLabel("Creating account…") : buttonLabel("Create teacher account")}
          </button>
        </form>
      </main>
    </div>
  );
}
