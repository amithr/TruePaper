"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { AuthLayout } from "@/components/AuthLayout";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { buttonLabel, ui } from "@/lib/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  /** Read OAuth callback errors out of the URL once on mount and strip them. */
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error");
    if (!authError) {
      return;
    }
    setError(authError);
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
        throw new Error(data.error ?? "Login failed.");
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Teacher"
      title="Welcome back"
      subtitle="Sign in to manage your forms and live sessions."
      footer={
        <p>
          New here?{" "}
          <Link href="/register" className={ui.link}>
            Create an account
          </Link>{" "}
          · Students join via{" "}
          <Link href="/#join-session" className={ui.link}>
            the join page
          </Link>
        </p>
      }
    >
      <div className="space-y-5">
        <GoogleSignInButton
          nextPath="/dashboard"
          label="Sign in with Google"
          disabled={pending}
          onError={(message) => setError(message)}
        />
        <div
          className="flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-[var(--tp-text-muted)]"
          aria-hidden
        >
          <span className="h-px flex-1 bg-[var(--tp-border)]" />
          <span>or</span>
          <span className="h-px flex-1 bg-[var(--tp-border)]" />
        </div>
        <form className="space-y-5" onSubmit={onSubmit}>
          <label className={ui.label}>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={ui.input}
              placeholder="you@school.edu"
            />
          </label>
          <label className={ui.label}>
            Password
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
            {pending ? buttonLabel("Signing in…") : buttonLabel("Sign in")}
          </button>
        </form>
      </div>
    </AuthLayout>
  );
}
