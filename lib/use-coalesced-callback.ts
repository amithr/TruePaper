"use client";

import { useCallback, useEffect, useRef } from "react";

import { useLatestRef } from "@/lib/use-latest-ref";

/**
 * Returns a stable trigger that coalesces bursty calls to an async `fn`:
 *
 * - never runs two invocations concurrently (an in-flight run absorbs extra
 *   triggers and re-runs once, on the trailing edge), and
 * - never starts two runs closer together than `minIntervalMs` (a call inside the
 *   cooldown schedules a single trailing run).
 *
 * Useful when several independent sources (e.g. a fixed poll + realtime pushes)
 * all want to refresh the same data — it collapses the storm into at most one
 * fetch per interval without a laggy fixed debounce.
 */
export function useCoalescedCallback(
  fn: () => Promise<void> | void,
  minIntervalMs: number,
): () => void {
  const fnRef = useLatestRef(fn);
  const ctrlRef = useRef<{
    running: boolean;
    queued: boolean;
    lastStart: number;
    timer: number | undefined;
  }>({ running: false, queued: false, lastStart: 0, timer: undefined });
  const triggerRef = useRef<() => void>(() => {});

  const trigger = useCallback(() => {
    const ctrl = ctrlRef.current;
    if (ctrl.running) {
      ctrl.queued = true;
      return;
    }
    const elapsed = Date.now() - ctrl.lastStart;
    if (elapsed < minIntervalMs) {
      if (ctrl.timer === undefined) {
        ctrl.timer = window.setTimeout(() => {
          ctrl.timer = undefined;
          triggerRef.current();
        }, minIntervalMs - elapsed);
      }
      return;
    }
    ctrl.running = true;
    ctrl.lastStart = Date.now();
    void (async () => {
      try {
        await fnRef.current();
      } finally {
        ctrl.running = false;
        if (ctrl.queued) {
          ctrl.queued = false;
          triggerRef.current();
        }
      }
    })();
  }, [fnRef, minIntervalMs]);

  useEffect(() => {
    triggerRef.current = trigger;
  }, [trigger]);

  useEffect(
    () => () => {
      if (ctrlRef.current.timer !== undefined) {
        window.clearTimeout(ctrlRef.current.timer);
        ctrlRef.current.timer = undefined;
      }
    },
    [],
  );

  return trigger;
}
