import { NextResponse } from "next/server";

import { createSupabaseServerClientForResponse } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Email confirmation / magic-link redirect target.
 * Add this URL to Supabase → Authentication → URL Configuration → Redirect URLs:
 *   http://localhost:3000/auth/callback
 *   https://<your-production-domain>/auth/callback
 * Email confirmation should land teachers on `/dashboard` (pass `?next=/dashboard` or rely on the default below).
 */
function safeRelativeNext(raw: string | null): string {
  const fallback = "/dashboard";
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return fallback;
  }
  return raw;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = safeRelativeNext(url.searchParams.get("next"));

  if (code) {
    const forwardedHost = request.headers.get("x-forwarded-host");
    const isLocal = process.env.NODE_ENV === "development";
    const base =
      isLocal || !forwardedHost ? url.origin : `https://${forwardedHost.split(",")[0]?.trim()}`;
    const destination = `${base}${nextPath}`;
    const response = NextResponse.redirect(destination);
    const supabase = await createSupabaseServerClientForResponse(response);
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return response;
    }
  }

  return NextResponse.redirect(url.origin);
}
