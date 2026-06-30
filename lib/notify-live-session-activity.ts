import { broadcastLiveSessionOverviewRefresh } from "@/lib/broadcast-live-session-overview";

/** Best-effort signal for teacher UIs to refresh session lists (after student DB writes). */
export async function notifyLiveSessionActivity(liveSessionId: string): Promise<void> {
  try {
    await broadcastLiveSessionOverviewRefresh(liveSessionId);
  } catch {
    /* postgres realtime may still deliver the change */
  }
}
