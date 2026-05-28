import { NextResponse } from "next/server";

import { createSupabaseServerClientForResponse } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Email confirmation / OAuth (e.g. Google) redirect target.
 * Add this URL to Supabase → Authentication → URL Configuration → Redirect URLs:
 *   http://localhost:3000/auth/callback
 *   https://<your-production-domain>/auth/callback
 *
 * Same-email account linking
 * --------------------------
 * Supabase Auth automatically links an OAuth identity (Google) to an EXISTING
 * user when the existing user's email is verified AND the OAuth provider also
 * marks the email as verified (Google always does). In that case
 * `exchangeCodeForSession` returns the existing user's session — no duplicate
 * user is created and the same `profiles` row remains in use.
 *
 * If the existing TruePaper account has NOT confirmed its email, Supabase
 * refuses to link and returns an "identity already associated" error. We
 * forward that to /login so the user gets a helpful message instead of a
 * silent redirect to the home page.
 *
 * Requires: Supabase → Authentication → Sign In / Sign Up →
 *   "Allow linking identities with the same email" ENABLED (default in 2024+).
 */
function safeRelativeNext(raw: string | null): string {
  const fallback = "/dashboard";
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return fallback;
  }
  return raw;
}

function friendlyAuthErrorMessage(raw: string | null | undefined): string {
  if (!raw) {
    return "We couldn't complete sign-in. Please try again.";
  }
  const lower = raw.toLowerCase();
  if (
    lower.includes("identity is already") ||
    lower.includes("identity_already_exists") ||
    lower.includes("user already registered") ||
    lower.includes("email address already registered") ||
    lower.includes("email link is invalid or has expired")
  ) {
    return "An account with this email already exists in TruePaper, but we couldn't automatically link Google to it. Sign in with your email and password — your account is preserved.";
  }
  if (lower.includes("access_denied") || lower.includes("user denied")) {
    return "Google sign-in was cancelled. Try again when you're ready.";
  }
  return raw;
}

function loginErrorRedirect(originBase: string, message: string): NextResponse {
  const target = new URL("/login", originBase);
  target.searchParams.set("auth_error", message);
  return NextResponse.redirect(target);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = safeRelativeNext(url.searchParams.get("next"));

  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocal = process.env.NODE_ENV === "development";
  const base =
    isLocal || !forwardedHost ? url.origin : `https://${forwardedHost.split(",")[0]?.trim()}`;

  /** Supabase / OAuth provider can redirect here with `error` instead of `code`. */
  const providerError =
    url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (providerError) {
    return loginErrorRedirect(base, friendlyAuthErrorMessage(providerError));
  }

  if (!code) {
    return NextResponse.redirect(base);
  }

  const destination = `${base}${nextPath}`;
  const response = NextResponse.redirect(destination);
  const supabase = await createSupabaseServerClientForResponse(response);
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (!error) {
    return response;
  }

  return loginErrorRedirect(base, friendlyAuthErrorMessage(error.message));
}
