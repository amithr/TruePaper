import Link from "next/link";
import { type ReactNode } from "react";

import { BrandMark } from "@/components/BrandMark";

type Props = {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthLayout({ eyebrow, title, subtitle, children, footer }: Props) {
  return (
    <div className="grid min-h-screen grid-cols-1 bg-[var(--tp-bg)] lg:grid-cols-2">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              "linear-gradient(135deg, var(--tp-brand) 0%, var(--tp-sky) 60%, var(--tp-violet) 100%)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.4) 0, transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.25) 0, transparent 45%)",
          }}
        />
        <BrandMark size="lg" href="/" />
        <div className="space-y-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
            Live classroom forms
          </p>
          <h2 className="text-3xl font-bold leading-tight">
            Build a form. Share a code.
            <br />
            Watch the class write.
          </h2>
          <ul className="space-y-2 text-sm text-white/90">
            <li className="flex items-start gap-2">
              <span aria-hidden className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-white" />
              No accounts for students — just a 6-character code.
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-white" />
              Autosave keeps every answer safe.
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-white" />
              Live feedback the moment you type it.
            </li>
          </ul>
        </div>
        <p className="text-xs text-white/70">
          For teachers · Students can join from{" "}
          <Link href="/#join-session" className="underline">
            the join page
          </Link>
          .
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md tp-anim-fade-up">
          <div className="lg:hidden mb-6">
            <BrandMark size="lg" href="/" />
          </div>
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--tp-text-muted)]">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--tp-text)]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 text-sm text-[var(--tp-text-secondary)]">{subtitle}</p>
          ) : null}
          <div className="mt-7">{children}</div>
          {footer ? (
            <div className="mt-6 text-sm text-[var(--tp-text-secondary)]">{footer}</div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
