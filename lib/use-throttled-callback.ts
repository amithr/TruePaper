import { useCallback, useEffect, useRef } from "react";

/** Returns a stable function that invokes `fn` at most once per `delayMs` (trailing edge). */
export function useThrottledCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs: number,
): (...args: A) => void {
  const fnRef = useRef(fn);
  const timerRef = useRef<number | undefined>(undefined);
  const argsRef = useRef<A | null>(null);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args: A) => {
      argsRef.current = args;
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = undefined;
        const pending = argsRef.current;
        if (pending) {
          fnRef.current(...pending);
        }
      }, delayMs);
    },
    [delayMs],
  );
}
