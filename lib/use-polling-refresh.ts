"use client";

import { useEffect } from "react";

import { useLatestRef } from "@/lib/use-latest-ref";

type Options = {
  enabled: boolean;
  intervalMs: number;
  /** When false, polling pauses (e.g. hidden tab). Defaults to true. */
  pollWhenHidden?: boolean;
  /**
   * Fire one refresh immediately when polling becomes enabled. Defaults to
   * true. Set false when the caller already performs its own initial load
   * (avoids a duplicate request right after first paint).
   */
  immediate?: boolean;
  onRefresh: () => void;
};

/** Reliable fallback when Supabase Realtime broadcast/postgres is unavailable. */
export function usePollingRefresh({
  enabled,
  intervalMs,
  pollWhenHidden = false,
  immediate = true,
  onRefresh,
}: Options): void {
  const onRefreshRef = useLatestRef(onRefresh);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) {
      return;
    }

    const tick = () => {
      if (!pollWhenHidden && document.visibilityState !== "visible") {
        return;
      }
      onRefreshRef.current();
    };

    if (immediate) {
      tick();
    }
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs, pollWhenHidden, immediate, onRefreshRef]);
}
