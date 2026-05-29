import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Cheap check: does the request already carry a Supabase auth cookie? If not,
 * there is nothing to refresh and we can skip the (network-round-trip) call to
 * `supabase.auth.getUser()` entirely. Guests get a free fast path.
 */
function requestHasSupabaseAuthCookie(request: NextRequest): boolean {
  for (const cookie of request.cookies.getAll()) {
    // Supabase SSR writes cookies named "sb-<projectRef>-auth-token[.N]".
    if (cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token")) {
      return true;
    }
  }
  return false;
}

/**
 * Refresh the Supabase auth session for the given request and write any
 * updated cookies into the supplied response. Returns the same response
 * object so callers can chain further mutations (e.g. set a locale cookie).
 *
 * Used by the Next.js 16 Proxy at the project root. No-ops (saving a network
 * round trip) when the request carries no Supabase auth cookie.
 */
export async function applySupabaseSessionRefresh(
  request: NextRequest,
  response: NextResponse,
): Promise<NextResponse> {
  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }
  if (!requestHasSupabaseAuthCookie(request)) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  await supabase.auth.getUser();
  return response;
}

/** @deprecated kept temporarily so any stale import compiles. Use applySupabaseSessionRefresh. */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  return applySupabaseSessionRefresh(
    request,
    NextResponse.next({ request: { headers: request.headers } }),
  );
}
