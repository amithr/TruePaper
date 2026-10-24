import type { SupabaseClient } from "@supabase/supabase-js";

/** The teacher running a live session, as students may see them. */
export type SessionHost = {
  displayName: string;
  avatarUrl: string | null;
};

export function parseSessionHost(data: unknown): SessionHost | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const o = data as { ok?: boolean; displayName?: unknown; avatarUrl?: unknown };
  if (o.ok !== true) {
    return null;
  }
  const displayName = typeof o.displayName === "string" ? o.displayName.trim() : "";
  const avatarUrl = typeof o.avatarUrl === "string" && o.avatarUrl.trim() ? o.avatarUrl.trim() : null;
  if (!displayName && !avatarUrl) {
    return null;
  }
  return { displayName, avatarUrl };
}

/** Best effort: null when the RPC is missing (pre-migration) or anything fails. */
export async function fetchSessionHost(supabase: SupabaseClient, liveSessionId: string): Promise<SessionHost | null> {
  try {
    const { data, error } = await supabase.rpc("get_live_session_host", { p_live_session_id: liveSessionId });
    if (error) {
      return null;
    }
    return parseSessionHost(data);
  } catch {
    return null;
  }
}
