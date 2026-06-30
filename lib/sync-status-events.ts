/**
 * Lightweight in-tab signal that a local offline queue changed, so the ambient
 * sync indicator can update reactively without polling. Used for the teacher
 * feedback queue, whose mutations can originate on a different route (watch page)
 * than where the indicator renders (session header).
 */
const SYNC_QUEUE_CHANGED_EVENT = "tp:sync-queue-changed";

export function emitSyncQueueChanged(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(SYNC_QUEUE_CHANGED_EVENT));
}

export function onSyncQueueChanged(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  window.addEventListener(SYNC_QUEUE_CHANGED_EVENT, callback);
  return () => window.removeEventListener(SYNC_QUEUE_CHANGED_EVENT, callback);
}
