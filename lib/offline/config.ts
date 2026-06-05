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

/** Air-raid auto-pause (requires NEXT_PUBLIC_AIR_ALERT_ENABLED=1). */
export function isAirAlertEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AIR_ALERT_ENABLED === "1";
}

export type DeliveryMode = "live" | "self_paced" | "hybrid";

export type ClientSyncState = "online" | "offline" | "syncing" | "synced" | "local_only";
