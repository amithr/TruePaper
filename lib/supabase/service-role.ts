import { createClient } from "@supabase/supabase-js";

/**
 * Privileged server client (bypasses RLS). Only for trusted server paths with no
 * user session — today the Stripe webhook. Requires SUPABASE_SERVICE_ROLE_KEY.
 */
export function createSupabaseServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable.");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function isServiceRoleConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}
