"use client";

import { useEffect } from "react";

import {
  LIVE_SESSION_OVERVIEW_EVENT,
  liveSessionOverviewChannelName,
} from "@/lib/broadcast-live-session-overview";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { useLatestRef } from "@/lib/use-latest-ref";

/** Refresh teacher roster/overview when students write presence or sync metadata. */
export function useLiveSessionOverviewRefresh(
  enabled: boolean,
  liveSessionId: string,
  onRefresh: () => void,
): void {
  const onRefreshRef = useLatestRef(onRefresh);

  useEffect(() => {
    if (!enabled || !liveSessionId.trim()) {
      return;
    }

    let cancelled = false;
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(liveSessionOverviewChannelName(liveSessionId))
      .on("broadcast", { event: LIVE_SESSION_OVERVIEW_EVENT }, () => {
        if (!cancelled) {
          onRefreshRef.current();
        }
      })
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [enabled, liveSessionId, onRefreshRef]);
}
