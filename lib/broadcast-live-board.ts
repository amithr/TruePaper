import type { SupabaseClient } from "@supabase/supabase-js";

export const LIVE_BOARD_BROADCAST_EVENT = "board_refresh";

export function liveBoardChannelName(joinCode: string): string {
  return `live-board:${joinCode.toUpperCase()}`;
}

/** Notify class display pages to reload counts (no polling). */
export async function broadcastLiveBoardRefresh(
  supabase: SupabaseClient,
  joinCode: string,
): Promise<void> {
  const code = joinCode.trim().toUpperCase();
  if (!code) {
    return;
  }

  const channelName = liveBoardChannelName(code);
  const channel = supabase.channel(channelName);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      void supabase.removeChannel(channel);
      reject(new Error("live board broadcast timeout"));
    }, 8000);

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        try {
          await channel.send({
            type: "broadcast",
            event: LIVE_BOARD_BROADCAST_EVENT,
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
        reject(new Error(`live board channel ${status}`));
      }
    });
  });
}
