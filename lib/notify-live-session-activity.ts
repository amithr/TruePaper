import { broadcastLiveSessionOverviewRefresh } from "@/lib/broadcast-live-session-overview";
import { createSupabaseAnonServiceClient } from "@/lib/supabase/anon-service";

/** Best-effort signal for teacher UIs to refresh session lists (after student DB writes). */
export async function notifyLiveSessionActivity(liveSessionId: string): Promise<void> {
  try {
    const supabase = createSupabaseAnonServiceClient();
    await broadcastLiveSessionOverviewRefresh(supabase, liveSessionId);
  } catch {
    /* postgres realtime may still deliver the change */
  }
}
