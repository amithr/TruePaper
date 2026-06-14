import {
  SYNC_RETRY_BASE_MS,
  SYNC_RETRY_MAX_MS,
} from "@/lib/offline/config";
import {
  clearFinishItem,
  getPendingFinish,
  markFinishAttempt,
} from "@/lib/offline/finish-queue";
import { submitExamToServer } from "@/lib/offline/finish-transport";

function retryDelayMs(attempts: number): number {
  const exp = Math.min(SYNC_RETRY_MAX_MS, SYNC_RETRY_BASE_MS * 2 ** attempts);
  const jitter = Math.floor(Math.random() * 0.3 * exp);
  return exp + jitter;
}

export async function drainFinishQueue(
  liveSessionId: string,
  deviceId: string,
): Promise<{ finished: boolean; retryable: boolean }> {
  const item = await getPendingFinish(liveSessionId, deviceId);
  if (!item) {
    return { finished: false, retryable: false };
  }

  if (item.lastAttemptAt && Date.now() - item.lastAttemptAt < retryDelayMs(item.attempts)) {
    return { finished: false, retryable: true };
  }

  await markFinishAttempt(item);
  const result = await submitExamToServer({
    liveSessionId: item.liveSessionId,
    deviceId: item.deviceId,
    displayName: item.displayName,
    answers: item.answers,
    submissionId: item.submissionId,
  });

  if (result.ok) {
    await clearFinishItem(liveSessionId, deviceId);
    return { finished: true, retryable: false };
  }

  if (!result.retryable) {
    await clearFinishItem(liveSessionId, deviceId);
    return { finished: false, retryable: false };
  }

  return { finished: false, retryable: true };
}
