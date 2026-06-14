import type { StudentAnswers } from "@/lib/forms";
import { idbDelete, idbGet, idbGetAll, idbPut, sessionDeviceKey } from "@/lib/offline/idb";
import type { FinishQueueItem } from "@/lib/offline/types";
import { newSubmissionId } from "@/lib/offline/sync-queue";

export async function getPendingFinish(
  liveSessionId: string,
  deviceId: string,
): Promise<FinishQueueItem | null> {
  return idbGet<FinishQueueItem>("finish_queue", sessionDeviceKey(liveSessionId, deviceId));
}

export async function hasPendingFinish(
  liveSessionId: string,
  deviceId: string,
): Promise<boolean> {
  const item = await getPendingFinish(liveSessionId, deviceId);
  return item != null;
}

export async function enqueueFinishItem(input: {
  liveSessionId: string;
  deviceId: string;
  displayName: string;
  answers: StudentAnswers;
  submissionId?: string;
}): Promise<FinishQueueItem> {
  const item: FinishQueueItem = {
    key: sessionDeviceKey(input.liveSessionId, input.deviceId),
    liveSessionId: input.liveSessionId,
    deviceId: input.deviceId.toLowerCase(),
    displayName: input.displayName,
    answers: input.answers,
    submissionId: input.submissionId ?? newSubmissionId(),
    createdAt: Date.now(),
    attempts: 0,
    lastAttemptAt: null,
  };
  await idbPut("finish_queue", item);
  return item;
}

export async function markFinishAttempt(item: FinishQueueItem): Promise<void> {
  await idbPut("finish_queue", {
    ...item,
    attempts: item.attempts + 1,
    lastAttemptAt: Date.now(),
  });
}

export async function clearFinishItem(liveSessionId: string, deviceId: string): Promise<void> {
  await idbDelete("finish_queue", sessionDeviceKey(liveSessionId, deviceId));
}

export async function listAllFinishItems(): Promise<FinishQueueItem[]> {
  return idbGetAll<FinishQueueItem>("finish_queue");
}
