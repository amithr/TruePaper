"use client";

import { useEffect } from "react";

import type { StudentExamRemotePatch } from "@/lib/student-exam-remote-patch";
import { useLatestRef } from "@/lib/use-latest-ref";

const STUDENT_STATE_POLL_MS = 3000;

type Options = {
  liveSessionId: string;
  deviceId: string;
  enabled: boolean;
  /** Delivers suspend/resume + ended ("finished") within one poll interval. */
  onPatch: (patch: StudentExamRemotePatch) => void;
};

type StudentStateResponse = {
  suspended?: boolean;
  finished?: boolean;
};

/**
 * Polls the slim student-state endpoint (~3s). Replaces Supabase Realtime for
 * students so 20k+ concurrent devices never hold WebSocket connections (Pro
 * caps Realtime at 10k). "Instant ended" = within one poll interval.
 */
export function useStudentExamStatePoll({
  liveSessionId,
  deviceId,
  enabled,
  onPatch,
}: Options): void {
  const onPatchRef = useLatestRef(onPatch);

  useEffect(() => {
    if (!enabled || !liveSessionId || !deviceId) {
      return;
    }

    let cancelled = false;

    const poll = async () => {
      if (!cancelled && document.visibilityState !== "visible") {
        return;
      }
      try {
        const res = await fetch(
          `/api/public/live-sessions/${liveSessionId}/state?deviceId=${encodeURIComponent(deviceId)}`,
          { cache: "no-store" },
        );
        if (cancelled || !res.ok) {
          return;
        }
        const data = (await res.json()) as StudentStateResponse;
        if (cancelled) {
          return;
        }
        onPatchRef.current({
          suspended: data.suspended === true,
          finished: data.finished === true,
        });
      } catch {
        /* transient; next tick retries */
      }
    };

    void poll();
    const id = window.setInterval(() => void poll(), STUDENT_STATE_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [liveSessionId, deviceId, enabled, onPatchRef]);
}
