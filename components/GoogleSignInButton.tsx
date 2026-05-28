"use client";

import { useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { buttonLabel, focusRing } from "@/lib/ui";

type Props = {
  /** Where to send the user after the OAuth callback exchanges the code. */
  nextPath?: string;
  /** Label override. Defaults differ between sign-in and sign-up surfaces. */
  label?: string;
  /** Disable while a sibling form is also submitting. */
  disabled?: boolean;
  /** Surfaced above the button when the OAuth handshake itself fails. */
  onError?: (message: string) => void;
};

export function GoogleSignInButton({
  nextPath = "/dashboard",
  label = "Continue with Google",
  disabled,
  onError,
}: Props) {
  const [pending, setPending] = useState(false);

  const startGoogleSignIn = async () => {
    setPending(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            access_type: "offline",
            prompt: "select_account",
          },
        },
      });
      if (error) {
        throw error;
      }
      // Supabase redirects the browser to Google; nothing else to do here.
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not start Google sign-in.";
      onError?.(message);
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => {
        void startGoogleSignIn();
      }}
      disabled={pending || disabled}
      className={`inline-flex w-full items-center justify-center gap-2.5 rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--tp-text)] shadow-sm transition-colors hover:bg-[var(--tp-bg-subtle)] disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`}
      aria-label={label}
    >
      <GoogleGlyph />
      {pending ? buttonLabel("Connecting…") : buttonLabel(label)}
    </button>
  );
}

function GoogleGlyph() {
  return (
    <svg
      aria-hidden
      className="h-4 w-4"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}
