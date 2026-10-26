"use client";

import { useEffect, useState } from "react";

import { useLatestRef } from "@/lib/use-latest-ref";

const RETRY_MS = 2500;
/** After this many silent retries the page admits it's slow and offers a button. */
const SLOW_AFTER = 3;

/**
 * Keeps retrying a page's first load until it succeeds. Pages swallow "network-ish"
 * failures of background refreshes (and a fetch cancelled by navigation looks like
 * one), and their polling only starts once data exists — so a failed first load
 * used to leave the loading bar spinning forever.
 */
export function useInitialLoadRetry(loaded: boolean, retry: () => void): { slow: boolean } {
  const retryRef = useLatestRef(retry);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (loaded) {
      return;
    }
    const id = window.setInterval(() => {
      setAttempts((n) => n + 1);
      retryRef.current();
    }, RETRY_MS);
    return () => window.clearInterval(id);
  }, [loaded, retryRef]);

  return { slow: !loaded && attempts >= SLOW_AFTER };
}
