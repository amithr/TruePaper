"use client";

import { useEffect, useMemo, useRef } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { useLatestRef } from "@/lib/use-latest-ref";

type PostgresSubscription = {
  table: "form_responses" | "form_sessions";
  filter?: string;
};

const DEFAULT_DEBOUNCE_MS = 300;

type Options = {
  debounceMs?: number;
  /** Minimum time between refresh calls (coalesces bursty postgres events). */
  minIntervalMs?: number;
};

/**
 * Calls `onRefresh` when matching rows change (Supabase Realtime postgres_changes).
 * No polling — refresh only runs in response to database events.
 */
export function usePostgresRealtimeRefresh(
  enabled: boolean,
  channelName: string,
  subscriptions: PostgresSubscription[],
  onRefresh: () => void,
  options: Options = {},
): void {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const minIntervalMs = options.minIntervalMs ?? 0;
  const onRefreshRef = useLatestRef(onRefresh);
  const lastRefreshAtRef = useRef(0);

  const subsKey = subscriptions
    .map((s) => `${s.table}:${s.filter ?? ""}`)
    .sort()
    .join("|");
  const stableSubscriptions = useMemo(
    () => subscriptions,
    // subscriptions content is fully represented by subsKey
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subsKey
    [subsKey],
  );

  useEffect(() => {
    if (!enabled || stableSubscriptions.length === 0) {
      return;
    }

    const supabase = createBrowserSupabaseClient();
    let channel = supabase.channel(channelName);
    let debounceTimer: number | undefined;

    const runRefresh = () => {
      lastRefreshAtRef.current = Date.now();
      onRefreshRef.current();
    };

    const scheduleRefresh = () => {
      window.clearTimeout(debounceTimer);
      const elapsed = Date.now() - lastRefreshAtRef.current;
      const waitMs = Math.max(debounceMs, minIntervalMs > 0 ? minIntervalMs - elapsed : 0);
      debounceTimer = window.setTimeout(() => {
        debounceTimer = undefined;
        runRefresh();
      }, waitMs);
    };

    for (const sub of stableSubscriptions) {
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: sub.table,
          ...(sub.filter ? { filter: sub.filter } : {}),
        },
        () => {
          scheduleRefresh();
        },
      );
    }

    channel.subscribe();

    return () => {
      window.clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  }, [enabled, channelName, stableSubscriptions, debounceMs, minIntervalMs, onRefreshRef]);
}
