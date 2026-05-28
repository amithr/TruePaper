import { useEffect, useRef, useState } from "react";

import { deferEffect } from "@/lib/defer-effect";

/**
 * Animates a number toward `value` over `durationMs` (ease-out cubic).
 * Honors `prefers-reduced-motion` by snapping instantly. The returned number is
 * rounded for direct rendering.
 */
export function useCountUp(value: number, durationMs: number = 800): number {
  const [current, setCurrent] = useState<number>(value);
  const currentRef = useRef<number>(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof requestAnimationFrame !== "function") {
      deferEffect(() => {
        currentRef.current = value;
        setCurrent(value);
      });
      return;
    }
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || durationMs <= 0) {
      deferEffect(() => {
        currentRef.current = value;
        setCurrent(value);
      });
      return;
    }
    if (currentRef.current === value) {
      return;
    }
    const start = performance.now();
    const fromVal = currentRef.current;
    const delta = value - fromVal;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(fromVal + delta * eased);
      currentRef.current = next;
      setCurrent(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [value, durationMs]);

  return current;
}
