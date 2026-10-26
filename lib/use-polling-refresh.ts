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
  /**
   * Also refresh when the tab becomes visible, the window regains focus, or the
   * page is restored from the back/forward cache — so a list that changed while
   * the teacher was elsewhere is current the moment they return.
   */
  refreshOnReturn?: boolean;
  onRefresh: () => void;
};

/** Reliable fallback when Supabase Realtime broadcast/postgres is unavailable. */
export function usePollingRefresh({
  enabled,
  intervalMs,
  pollWhenHidden = false,
  immediate = true,
  refreshOnReturn = false,
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

    const onReturn = () => {
      if (document.visibilityState === "visible") {
        onRefreshRef.current();
      }
    };
    if (refreshOnReturn) {
      document.addEventListener("visibilitychange", onReturn);
      window.addEventListener("focus", onReturn);
      window.addEventListener("pageshow", onReturn);
    }
    return () => {
      window.clearInterval(id);
      if (refreshOnReturn) {
        document.removeEventListener("visibilitychange", onReturn);
        window.removeEventListener("focus", onReturn);
        window.removeEventListener("pageshow", onReturn);
      }
    };
  }, [enabled, intervalMs, pollWhenHidden, immediate, refreshOnReturn, onRefreshRef]);
}
