import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using the anon key only (no user session).
 * Use only where RLS allows the `anon` role or where you call SECURITY DEFINER RPCs.
 */
export function createSupabaseAnonServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable.",
    );
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
