"use client";

import { useEffect, useRef } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type PostgresSubscription = {
  table: "form_responses" | "form_sessions";
  filter?: string;
};

const DEFAULT_DEBOUNCE_MS = 300;

/**
 * Calls `onRefresh` when matching rows change (Supabase Realtime postgres_changes).
 * No polling — refresh only runs in response to database events.
 */
export function usePostgresRealtimeRefresh(
  enabled: boolean,
  channelName: string,
  subscriptions: PostgresSubscription[],
  onRefresh: () => void,
  debounceMs = DEFAULT_DEBOUNCE_MS,
): void {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const subsKey = subscriptions
    .map((s) => `${s.table}:${s.filter ?? ""}`)
    .sort()
    .join("|");

  useEffect(() => {
    if (!enabled || subscriptions.length === 0) {
      return;
    }

    const supabase = createBrowserSupabaseClient();
    let channel = supabase.channel(channelName);
    let debounceTimer: number | undefined;

    const scheduleRefresh = () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        debounceTimer = undefined;
        onRefreshRef.current();
      }, debounceMs);
    };

    for (const sub of subscriptions) {
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
  }, [enabled, channelName, subsKey, debounceMs]);
}
