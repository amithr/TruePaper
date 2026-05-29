import type { SupabaseClient } from "@supabase/supabase-js";

import type { StudentAnswers } from "@/lib/forms";

export const LIVE_SESSION_OVERVIEW_EVENT = "overview_refresh";
/** Ephemeral student answers for the exam list / session roster (all devices). */
export const LIVE_SESSION_ANSWER_DRAFT_EVENT = "overview_answer_draft";

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

/** Push live typing to teachers on the session overview channel (exam list). */
export async function broadcastLiveSessionAnswerDraft(
  supabase: SupabaseClient,
  liveSessionId: string,
  deviceId: string,
  answers: StudentAnswers,
): Promise<void> {
  const id = liveSessionId.trim();
  const deviceNorm = deviceId.trim().toLowerCase();
  if (!id || !deviceNorm) {
    return;
  }

  const channelName = liveSessionOverviewChannelName(id);
  const channel = supabase.channel(channelName);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      void supabase.removeChannel(channel);
      reject(new Error("session overview draft broadcast timeout"));
    }, 8000);

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        try {
          await channel.send({
            type: "broadcast",
            event: LIVE_SESSION_ANSWER_DRAFT_EVENT,
            payload: {
              deviceId: deviceNorm,
              answers,
              at: new Date().toISOString(),
            },
          });
        } finally {
          void supabase.removeChannel(channel);
          resolve();
        }
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeout);
        void supabase.removeChannel(channel);
        reject(new Error(`session overview draft channel ${status}`));
      }
    });
  });
}
