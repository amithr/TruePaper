import type { SupabaseClient } from "@supabase/supabase-js";

export const LIVE_SESSION_OVERVIEW_EVENT = "overview_refresh";

export function liveSessionOverviewChannelName(liveSessionId: string): string {
  return `live-session-overview:${liveSessionId}`;
}

/** Notify teacher dashboard + session overview to reload participant lists. */
export async function broadcastLiveSessionOverviewRefresh(
  supabase: SupabaseClient,
  liveSessionId: string,
): Promise<void> {
  const id = liveSessionId.trim();
  if (!id) {
    return;
  }

  const channelName = liveSessionOverviewChannelName(id);
  const channel = supabase.channel(channelName);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      void supabase.removeChannel(channel);
      reject(new Error("session overview broadcast timeout"));
    }, 8000);

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        try {
          await channel.send({
            type: "broadcast",
            event: LIVE_SESSION_OVERVIEW_EVENT,
            payload: { at: new Date().toISOString() },
          });
        } finally {
          void supabase.removeChannel(channel);
          resolve();
        }
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeout);
        void supabase.removeChannel(channel);
        reject(new Error(`session overview channel ${status}`));
      }
    });
  });
}
