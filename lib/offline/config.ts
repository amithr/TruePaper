/** Initial exam shell payload budget (bytes, uncompressed JSON estimate). */
export const EXAM_SHELL_BUDGET_BYTES = 512 * 1024;

/** Debounce before network sync (ms). */
export const SYNC_DEBOUNCE_MS = 400;

/** Max wait between syncs during continuous typing (ms). */
export const SYNC_MAX_WAIT_MS = 3000;

/** Base retry delay for sync queue (ms). */
export const SYNC_RETRY_BASE_MS = 800;

/** Max retry delay with jitter (ms). */
export const SYNC_RETRY_MAX_MS = 30_000;

/** Poll interval while answer sync is pending (ms). */
export const SYNC_POLL_INTERVAL_MS = 8_000;

/** Poll interval while a finish submit is queued (ms). */
export const FINISH_POLL_INTERVAL_MS = 6_000;

/** Random delay before reconnect drain after `online` (ms). */
export const ONLINE_RECONNECT_JITTER_MS = 3_000;

/** Tab hidden before reporting leave (live mode, ms). */
export const TAB_LEAVE_GRACE_LIVE_MS = 8_000;

/** Tab hidden before reporting leave (hybrid/self-paced, ms). */
export const TAB_LEAVE_GRACE_FLEX_MS = 15_000;

/** Background Sync tag registered with the service worker. */
export const OFFLINE_SYNC_TAG = "truepaper-offline-sync";

/** Reachability ping interval while exam is active (ms). */
export const REACHABILITY_PING_INTERVAL_MS = 12_000;

/** Air-raid auto-pause (requires NEXT_PUBLIC_AIR_ALERT_ENABLED=1). */
export function isAirAlertEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AIR_ALERT_ENABLED === "1";
}

export type DeliveryMode = "live" | "self_paced" | "hybrid";

export type ClientSyncState = "online" | "offline" | "syncing" | "synced" | "local_only";
