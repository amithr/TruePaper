"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useRef } from "react";

import {
  STUDENT_EXAM_BROADCAST_EVENT,
  studentExamChannelName,
} from "@/lib/student-exam-channel";
import { studentExamRemotePatchFromRow, type StudentExamRemotePatch } from "@/lib/student-exam-remote-patch";
import { isAnswersOnlyFormResponseUpdate } from "@/lib/student-exam-realtime-filter";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type Options = {
  liveSessionId: string;
  deviceId: string;
  enabled: boolean;
  onPatch: (patch: StudentExamRemotePatch) => void;
  /** Fires when the broadcast channel is subscribed (sync after connect). */
  onBroadcastReady?: () => void;
};

function parseBroadcastPayload(payload: unknown): StudentExamRemotePatch | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return payload as StudentExamRemotePatch;
}

/**
 * Supabase Realtime only: broadcast channel (always) + postgres_changes when JWT is available.
 * Never polls. Never syncs answers into the UI.
 */
export function useStudentExamRealtime({
  liveSessionId,
  deviceId,
  enabled,
  onPatch,
  onBroadcastReady,
}: Options): void {
  const onPatchRef = useRef(onPatch);
  onPatchRef.current = onPatch;
  const onBroadcastReadyRef = useRef(onBroadcastReady);
  onBroadcastReadyRef.current = onBroadcastReady;

  useEffect(() => {
    if (!enabled || !liveSessionId || !deviceId) {
      return;
    }

    const deviceNorm = deviceId.toLowerCase();
    let cancelled = false;
    const channels: RealtimeChannel[] = [];
    const supabase = createBrowserSupabaseClient();

    const applyPatch = (patch: StudentExamRemotePatch) => {
      if (cancelled || Object.keys(patch).length === 0) {
        return;
      }
      onPatchRef.current(patch);
    };

    const onPostgresChange = (payload: {
      old: Record<string, unknown> | null;
      new: Record<string, unknown> | null;
    }) => {
      const row = payload.new;
      if (!row || typeof row.anonymous_session_id !== "string") {
        return;
      }
      if (row.anonymous_session_id.toLowerCase() !== deviceNorm) {
        return;
      }
      if (isAnswersOnlyFormResponseUpdate(payload.old ?? undefined, row)) {
        return;
      }
      applyPatch(studentExamRemotePatchFromRow(row));
    };

    const subscribeBroadcast = () => {
      const channel = supabase
        .channel(studentExamChannelName(liveSessionId, deviceId))
        .on("broadcast", { event: STUDENT_EXAM_BROADCAST_EVENT }, ({ payload }) => {
          const patch = parseBroadcastPayload(payload);
          if (patch) {
            applyPatch(patch);
          }
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED" && !cancelled) {
            onBroadcastReadyRef.current?.();
          }
        });
      channels.push(channel);
    };

    const subscribePostgres = async () => {
      const tokenRes = await fetch(
        `/api/public/live-sessions/${liveSessionId}/realtime-token?deviceId=${encodeURIComponent(deviceId)}`,
      );
      if (cancelled || !tokenRes.ok) {
        return;
      }
      const { token } = (await tokenRes.json()) as { token?: string };
      if (cancelled || !token) {
        return;
      }

      await supabase.realtime.setAuth(token);
      if (cancelled) {
        return;
      }

      const channel = supabase
        .channel(`student-exam-pg:${liveSessionId}:${deviceNorm}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "form_responses",
            filter: `live_session_id=eq.${liveSessionId}`,
          },
          onPostgresChange,
        )
        .subscribe();
      channels.push(channel);
    };

    subscribeBroadcast();
    void subscribePostgres();

    return () => {
      cancelled = true;
      for (const channel of channels) {
        void supabase.removeChannel(channel);
      }
    };
  }, [liveSessionId, deviceId, enabled]);
}
