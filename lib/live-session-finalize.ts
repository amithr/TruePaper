import type { SupabaseClient } from "@supabase/supabase-js";

/** When the session window has ended, mark every student device in the session as finished. */
export async function finalizeLiveSessionIfClosed(
  supabase: SupabaseClient,
  liveSessionId: string,
): Promise<void> {
  const { data: fs, error: fsError } = await supabase
    .from("form_sessions")
    .select("closes_at")
    .eq("id", liveSessionId)
    .maybeSingle();

  if (fsError || !fs?.closes_at) {
    return;
  }

  if (Date.now() <= new Date(fs.closes_at as string).getTime()) {
    return;
  }

  const { error } = await supabase.rpc("finalize_all_live_session_students", {
    p_live_session_id: liveSessionId,
  });

  if (error) {
    throw new Error(error.message);
  }
}
