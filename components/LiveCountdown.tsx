"use client";

import { useEffect, useState, type ReactNode } from "react";

import { deferEffect } from "@/lib/defer-effect";

/**
 * Self-ticking countdown. Owns its own 1s interval so the (often very large)
 * parent screen doesn't have to re-render every second just to move a clock —
 * only this tiny subtree does.
 */
export function LiveCountdown({
  closesAt,
  render,
}: {
  closesAt: string;
  render: (msLeft: number) => ReactNode;
}) {
  const [msLeft, setMsLeft] = useState(() => new Date(closesAt).getTime() - Date.now());

  useEffect(() => {
    const target = new Date(closesAt).getTime();
    const tick = () => setMsLeft(target - Date.now());
    // Resync after commit (covers a changed closesAt) without a synchronous set.
    deferEffect(tick);
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [closesAt]);

  return <>{render(msLeft)}</>;
}
