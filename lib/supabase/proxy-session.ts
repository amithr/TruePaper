import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/request-auth";
import { requestHasSupabaseAuthCookie } from "@/lib/supabase/auth-cookie";

/**
 * Refresh Supabase auth cookies on the proxy response and return the session
 * user + profile in one round trip (used for teacher home redirects).
 */
export async function refreshProxySession(
  request: NextRequest,
  response: NextResponse,
): Promise<{
  response: NextResponse;
  session: Awaited<ReturnType<typeof getSessionUser>>;
}> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !requestHasSupabaseAuthCookie(request)) {
    return { response, session: null };
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

  const session = await getSessionUser(supabase);
  return { response, session };
}
