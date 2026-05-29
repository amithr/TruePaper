"use client";

import { useEffect, useState } from "react";

import {
  LIVE_SESSION_ANSWER_DRAFT_EVENT,
  liveSessionOverviewChannelName,
} from "@/lib/broadcast-live-session-overview";
import type { StudentAnswers } from "@/lib/forms";
import { parseStudentAnswersJson } from "@/lib/student-answers-json";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

/** Live answer drafts keyed by normalized device id (exam list / roster). */
export function useLiveSessionAnswerDrafts(
  enabled: boolean,
  liveSessionId: string,
): Record<string, StudentAnswers> {
  const [draftsByDevice, setDraftsByDevice] = useState<Record<string, StudentAnswers>>({});

  useEffect(() => {
    if (!enabled || !liveSessionId.trim()) {
      return;
    }

    let cancelled = false;
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(liveSessionOverviewChannelName(liveSessionId))
      .on("broadcast", { event: LIVE_SESSION_ANSWER_DRAFT_EVENT }, ({ payload }) => {
        if (cancelled || !payload || typeof payload !== "object" || Array.isArray(payload)) {
          return;
        }
        const raw = payload as { deviceId?: unknown; answers?: unknown };
        const deviceId =
          typeof raw.deviceId === "string" ? raw.deviceId.trim().toLowerCase() : "";
        if (!deviceId) {
          return;
        }
        const answers = parseStudentAnswersJson(raw.answers);
        setDraftsByDevice((prev) => ({ ...prev, [deviceId]: answers }));
      })
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [enabled, liveSessionId]);

  return draftsByDevice;
}
