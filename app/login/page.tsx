"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AuthLayout } from "@/components/AuthLayout";
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
    </AuthLayout>
  );
}
