import { OFFLINE_SYNC_TAG } from "@/lib/offline/config";

/** Register a Background Sync retry (best-effort; unsupported browsers no-op). */
export async function registerOfflineBackgroundSync(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const syncManager = (reg as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    }).sync;
    if (syncManager?.register) {
      await syncManager.register(OFFLINE_SYNC_TAG);
    }
  } catch {
    /* unsupported or denied */
  }
}

/** Ask the active service worker to drain queues immediately. */
export function postMessageDrainSync(): void {
  if (typeof navigator === "undefined" || !navigator.serviceWorker?.controller) {
    return;
  }
  navigator.serviceWorker.controller.postMessage({ type: "DRAIN_OFFLINE_SYNC" });
}
