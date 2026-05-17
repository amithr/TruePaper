import type { SupabaseClient } from "@supabase/supabase-js";

export const TEACHER_WATCH_BROADCAST_EVENT = "watch_refresh";

export function teacherWatchChannelName(liveSessionId: string, deviceId: string): string {
  return `teacher-watch:${liveSessionId}:${deviceId.toLowerCase()}`;
}

/** Tell the teacher watch page for this student to reload the exam snapshot. */
export async function broadcastTeacherWatchRefresh(
  supabase: SupabaseClient,
  liveSessionId: string,
  deviceId: string,
): Promise<void> {
  const sessionId = liveSessionId.trim();
  const deviceNorm = deviceId.trim().toLowerCase();
  if (!sessionId || !deviceNorm) {
    return;
  }

  const channelName = teacherWatchChannelName(sessionId, deviceNorm);
  const channel = supabase.channel(channelName);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      void supabase.removeChannel(channel);
      reject(new Error("teacher watch broadcast timeout"));
    }, 8000);

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        try {
          await channel.send({
            type: "broadcast",
            event: TEACHER_WATCH_BROADCAST_EVENT,
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
        reject(new Error(`teacher watch channel ${status}`));
      }
    });
  });
}
