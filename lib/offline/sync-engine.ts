import { SYNC_RETRY_BASE_MS, SYNC_RETRY_MAX_MS } from "@/lib/offline/config";
import {
  listPendingSyncItems,
  markSyncAttempt,
  removeSyncItem,
} from "@/lib/offline/sync-queue";
import type { SyncResult } from "@/lib/offline/types";

export type SyncTransport = (item: {
  submissionId: string;
  liveSessionId: string;
  deviceId: string;
  displayName: string;
  answers: Record<string, string>;
}) => Promise<SyncResult>;

function retryDelayMs(attempts: number): number {
  const exp = Math.min(SYNC_RETRY_MAX_MS, SYNC_RETRY_BASE_MS * 2 ** attempts);
  const jitter = Math.floor(Math.random() * 0.3 * exp);
  return exp + jitter;
}

export async function drainSyncQueue(
  liveSessionId: string,
  deviceId: string,
  transport: SyncTransport,
): Promise<{ synced: number; failed: number; pending: number }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const pending = (await listPendingSyncItems(liveSessionId, deviceId)).length;
    return { synced: 0, failed: 0, pending };
  }

  const items = await listPendingSyncItems(liveSessionId, deviceId);
  let synced = 0;
  let failed = 0;

  for (const item of items) {
    if (item.lastAttemptAt && Date.now() - item.lastAttemptAt < retryDelayMs(item.attempts)) {
      failed += 1;
      continue;
    }

    await markSyncAttempt(item);
    const result = await transport({
      submissionId: item.submissionId,
      liveSessionId: item.liveSessionId,
      deviceId: item.deviceId,
      displayName: item.displayName,
      answers: item.answers,
    });

    if (result.ok) {
      await removeSyncItem(item.submissionId);
      synced += 1;
    } else if (!result.retryable) {
      await removeSyncItem(item.submissionId);
      failed += 1;
    } else {
      failed += 1;
    }
  }

  const pending = (await listPendingSyncItems(liveSessionId, deviceId)).length;
  return { synced, failed, pending };
}
