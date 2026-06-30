"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { FEEDBACK_POLL_INTERVAL_MS } from "@/lib/offline/config";
import type { StudentFeedbackItem } from "@/lib/feedback-items";

type Options = {
  liveSessionId: string | null;
  deviceId: string | null;
  enabled: boolean;
};

type Result = {
  items: StudentFeedbackItem[];
  /** True until the student has opened the feedback panel for the latest items. */
  hasUnseen: boolean;
  unseenCount: number;
  markSeen: () => void;
};

/**
 * Polls the student's queued teacher feedback (calm, count-based — no push, no
 * sound). Confirms delivery back to the server so the teacher can see it landed.
 * Delivery confirmation is idempotent and best-effort.
 */
export function useStudentFeedbackItems({ liveSessionId, deviceId, enabled }: Options): Result {
  const [items, setItems] = useState<StudentFeedbackItem[]>([]);
  const [seenIds, setSeenIds] = useState<Set<string>>(() => new Set());
  const confirmedRef = useRef<Set<string>>(new Set());

  const confirmDelivery = useCallback(
    async (ids: string[]) => {
      if (!liveSessionId || !deviceId || ids.length === 0) {
        return;
      }
      try {
        await fetch(`/api/public/live-sessions/${liveSessionId}/feedback-items/delivered`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId, ids }),
          keepalive: true,
        });
        for (const id of ids) {
          confirmedRef.current.add(id);
        }
      } catch {
        /* retry on next poll */
      }
    },
    [liveSessionId, deviceId],
  );

  useEffect(() => {
    if (!enabled || !liveSessionId || !deviceId) {
      return;
    }

    let cancelled = false;

    const poll = async () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      try {
        const res = await fetch(
          `/api/public/live-sessions/${liveSessionId}/feedback-items?deviceId=${encodeURIComponent(
            deviceId,
          )}`,
          { cache: "no-store" },
        );
        if (cancelled || !res.ok) {
          return;
        }
        const data = (await res.json()) as { items?: StudentFeedbackItem[] };
        if (cancelled) {
          return;
        }
        const next = Array.isArray(data.items) ? data.items : [];
        setItems(next);

        const toConfirm = next.map((i) => i.id).filter((id) => !confirmedRef.current.has(id));
        void confirmDelivery(toConfirm);
      } catch {
        /* transient; next tick retries */
      }
    };

    void poll();
    const id = window.setInterval(() => void poll(), FEEDBACK_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, liveSessionId, deviceId, confirmDelivery]);

  const markSeen = useCallback(() => {
    setSeenIds(new Set(items.map((i) => i.id)));
  }, [items]);

  const unseen = items.filter((i) => !seenIds.has(i.id));

  return {
    items,
    hasUnseen: unseen.length > 0,
    unseenCount: unseen.length,
    markSeen,
  };
}
