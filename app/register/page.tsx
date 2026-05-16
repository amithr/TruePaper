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

const REQUIREMENT_ROWS = getPasswordRequirementLabels();

const inputBaseClass =
  "mt-1 w-full rounded-md border px-3 py-2 transition-[box-shadow,border-color] duration-150";

function passwordInputClass(met: boolean): string {
  if (met) {
    return `${inputBaseClass} border-green-600 outline outline-2 outline-offset-0 outline-green-600`;
  }
  return `${inputBaseClass} border-zinc-300 outline-none`;
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
    <div className="min-h-screen bg-zinc-100 py-16 text-zinc-900">
      <main className="mx-auto w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">Teacher registration</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Students can fill out forms without an account. This page is for teachers who build forms.
        </p>
        <p className="mt-2 text-sm text-zinc-600">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-zinc-900 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
          >
            Log in
          </Link>
        </p>
        <p className="mt-3 text-sm text-zinc-600">
          Joining a class with a code?{" "}
          <Link
            href="/#join-session"
            className="font-medium text-zinc-900 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
          >
            Student join
          </Link>
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm font-medium">
            Your name
            <input
              type="text"
              autoComplete="name"
              required
              spellCheck={false}
              maxLength={120}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
              placeholder="e.g. Alex Morgan"
            />
          </label>
          <label className="block text-sm font-medium">
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
            />
          </label>
          <div>
            <label className="block text-sm font-medium">
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
                    className={`flex items-center gap-2 ${met ? "text-green-700" : "text-zinc-500"}`}
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
          <label className="block text-sm font-medium">
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
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {info ? <p className="text-sm text-zinc-700">{info}</p> : null}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-zinc-900 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? "Creating account…" : "Create teacher account"}
          </button>
        </form>
      </main>
    </div>
  );
}
