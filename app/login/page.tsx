"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { buttonLabel, ui } from "@/lib/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

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
    <div className={ui.page}>
      <main className={`${ui.pageMainNarrow} tp-card p-8 sm:p-10`}>
        <p className={ui.sectionTitle}>Teacher account</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-[var(--tp-text)]">Log in</h1>
        <p className="mt-2 text-sm text-[var(--tp-text-secondary)]">
          Students do not need an account to answer forms.
        </p>
        <p className="mt-2 text-sm text-[var(--tp-text-secondary)]">
          No account?{" "}
          <Link href="/register" className={ui.link}>
            Register
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
      </main>
    </div>
  );
}
