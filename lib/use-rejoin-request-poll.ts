"use client";

import { useEffect } from "react";

import { useLatestRef } from "@/lib/use-latest-ref";

const REJOIN_POLL_MS = 3000;

export type RejoinRequestStatus = "pending" | "approved" | "declined" | "expired";

type StateResponse = {
  hasResponse?: boolean;
  rejoinRequest?: string;
};

/** Pure mapping from the slim state payload, so the wait screen is unit-testable. */
export function rejoinStatusFromState(data: StateResponse): RejoinRequestStatus {
  if (data.hasResponse === true && data.rejoinRequest !== "pending") {
    // Approval moved the attempt to this device.
    return "approved";
  }
  if (data.rejoinRequest === "pending") {
    return "pending";
  }
  if (data.rejoinRequest === "declined") {
    return "declined";
  }
  // "expired", "none", or a pre-migration server that knows nothing about requests.
  return "expired";
}

/**
 * While a student waits for the teacher to approve continuing on this device,
 * poll the slim state endpoint (~3s, visible tab only) and report each change.
 * The caller owns the status state (and resets it per request).
 */
export function useRejoinRequestPoll(input: {
  liveSessionId: string;
  deviceId: string;
  enabled: boolean;
  onStatus: (status: RejoinRequestStatus) => void;
}): void {
  const { liveSessionId, deviceId, enabled } = input;
  const onStatusRef = useLatestRef(input.onStatus);

  useEffect(() => {
    if (!enabled || !liveSessionId || !deviceId) {
      return;
    }
    let cancelled = false;
    let last: RejoinRequestStatus = "pending";

    const poll = async () => {
      if (cancelled || document.visibilityState !== "visible") {
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
        const data = (await res.json()) as StateResponse;
        if (cancelled) {
          return;
        }
        const next = rejoinStatusFromState(data);
        if (next !== last) {
          last = next;
          onStatusRef.current(next);
        }
      } catch {
        /* transient; next tick retries */
      }
    };

    void poll();
    const id = window.setInterval(() => void poll(), REJOIN_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [liveSessionId, deviceId, enabled, onStatusRef]);
}
