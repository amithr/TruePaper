/** Run work after the current render commit (avoids react-hooks/set-state-in-effect). */
export function deferEffect(fn: () => void): void {
  queueMicrotask(fn);
}
