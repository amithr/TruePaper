import type { StudentAnswers } from "@/lib/forms";
import { idbDelete, idbGetAllByIndex, idbPut } from "@/lib/offline/idb";
import type { SyncQueueItem } from "@/lib/offline/types";

export function newSubmissionId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `sub-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function clearPendingForSession(liveSessionId: string, deviceId: string): Promise<void> {
  const existing = await listPendingSyncItems(liveSessionId, deviceId);
  for (const item of existing) {
    await idbDelete("sync_queue", item.submissionId);
  }
}

export async function enqueueSyncItem(input: {
  liveSessionId: string;
  deviceId: string;
  displayName: string;
  answers: StudentAnswers;
}): Promise<SyncQueueItem> {
  await clearPendingForSession(input.liveSessionId, input.deviceId);
  const item: SyncQueueItem = {
    submissionId: newSubmissionId(),
    liveSessionId: input.liveSessionId,
    deviceId: input.deviceId.toLowerCase(),
    displayName: input.displayName,
    answers: input.answers,
    createdAt: Date.now(),
    attempts: 0,
    lastAttemptAt: null,
  };
  await idbPut("sync_queue", item);
  return item;
}

export async function listPendingSyncItems(
  liveSessionId: string,
  deviceId: string,
): Promise<SyncQueueItem[]> {
  const key = [liveSessionId, deviceId.toLowerCase()];
  const items = await idbGetAllByIndex<SyncQueueItem>("sync_queue", "by_session", IDBKeyRange.only(key));
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

export async function markSyncAttempt(item: SyncQueueItem): Promise<void> {
  await idbPut("sync_queue", {
    ...item,
    attempts: item.attempts + 1,
    lastAttemptAt: Date.now(),
  });
}

export async function removeSyncItem(submissionId: string): Promise<void> {
  await idbDelete("sync_queue", submissionId);
}

export async function pendingSyncCount(
  liveSessionId: string,
  deviceId: string,
): Promise<number> {
  const items = await listPendingSyncItems(liveSessionId, deviceId);
  return items.length;
}
