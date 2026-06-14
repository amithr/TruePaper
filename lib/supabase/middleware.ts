import { type NextRequest, NextResponse } from "next/server";

import { refreshProxySession } from "@/lib/supabase/proxy-session";

export { requestHasSupabaseAuthCookie } from "@/lib/supabase/auth-cookie";
export { refreshProxySession } from "@/lib/supabase/proxy-session";

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
  const { response: refreshed } = await refreshProxySession(request, response);
  return refreshed;
}

/** @deprecated kept temporarily so any stale import compiles. Use applySupabaseSessionRefresh. */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  return applySupabaseSessionRefresh(
    request,
    NextResponse.next({ request: { headers: request.headers } }),
  );
}
