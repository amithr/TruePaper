"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useMemo } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { useLatestRef } from "@/lib/use-latest-ref";

const DEFAULT_DEBOUNCE_MS = 300;

/**
 * Calls `onRefresh` when a Supabase Realtime broadcast is received on any of the channels.
 */
export function useBroadcastRefresh(
  enabled: boolean,
  channelNames: string[],
  event: string,
  onRefresh: () => void,
  debounceMs = DEFAULT_DEBOUNCE_MS,
): void {
  const onRefreshRef = useLatestRef(onRefresh);

  const channelsKey = [...channelNames].sort().join("|");
  const stableChannelNames = useMemo(
    () => [...channelNames].sort(),
    // channelNames content is fully represented by channelsKey
    // eslint-disable-next-line react-hooks/exhaustive-deps -- channelsKey
    [channelsKey],
  );

  useEffect(() => {
    if (!enabled || stableChannelNames.length === 0) {
      return;
    }

    const supabase = createBrowserSupabaseClient();
    const channels: RealtimeChannel[] = [];
    let debounceTimer: number | undefined;

    const scheduleRefresh = () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        debounceTimer = undefined;
        onRefreshRef.current();
      }, debounceMs);
    };

    for (const name of stableChannelNames) {
      const channel = supabase
        .channel(name)
        .on("broadcast", { event }, () => {
          scheduleRefresh();
        })
        .subscribe();
      channels.push(channel);
    }

    return () => {
      window.clearTimeout(debounceTimer);
      for (const channel of channels) {
        void supabase.removeChannel(channel);
      }
    };
  }, [enabled, stableChannelNames, event, debounceMs, onRefreshRef]);
}
