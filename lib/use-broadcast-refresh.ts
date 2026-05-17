"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useRef } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

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
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const channelsKey = [...channelNames].sort().join("|");

  useEffect(() => {
    if (!enabled || channelNames.length === 0) {
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

    for (const name of channelNames) {
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
  }, [enabled, channelsKey, event, debounceMs]);
}
