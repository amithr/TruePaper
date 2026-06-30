import type { SupabaseClient } from "@supabase/supabase-js";

import type { StudentAnswers } from "@/lib/forms";

export const LIVE_SESSION_OVERVIEW_EVENT = "overview_refresh";
/** Ephemeral student answers for the exam list / session roster (all devices). */
export const LIVE_SESSION_ANSWER_DRAFT_EVENT = "overview_answer_draft";

export function liveSessionOverviewChannelName(liveSessionId: string): string {
  return `live-session-overview:${liveSessionId}`;
}

/**
 * Post a single broadcast message via Supabase Realtime's stateless HTTP API.
 *
 * This deliberately avoids the websocket `channel.subscribe()` handshake — that
 * handshake costs far more than the message itself and, from stateless serverless
 * routes, cannot be reused across calls. At the project's scale target a fresh
 * subscribe per student write is the dominant realtime overhead, so high-frequency
 * server-side notifications go over plain HTTP instead.
 */
async function postRealtimeBroadcast(
  topic: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: [{ topic, event, payload, private: false }],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Notify teacher dashboard + session overview to reload participant lists. */
export async function broadcastLiveSessionOverviewRefresh(liveSessionId: string): Promise<void> {
  const id = liveSessionId.trim();
  if (!id) {
    return;
  }
  await postRealtimeBroadcast(liveSessionOverviewChannelName(id), LIVE_SESSION_OVERVIEW_EVENT, {
    at: new Date().toISOString(),
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
