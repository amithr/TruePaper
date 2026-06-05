import type { StudentAnswers } from "@/lib/forms";
import { idbGet, idbPut, sessionDeviceKey } from "@/lib/offline/idb";
import type { LocalAnswerRecord } from "@/lib/offline/types";

export async function loadLocalAnswers(
  liveSessionId: string,
  deviceId: string,
): Promise<LocalAnswerRecord | null> {
  return idbGet<LocalAnswerRecord>("answers", sessionDeviceKey(liveSessionId, deviceId));
}

export async function saveLocalAnswers(
  liveSessionId: string,
  deviceId: string,
  answers: StudentAnswers,
  changedQuestionIds?: string[],
): Promise<void> {
  const key = sessionDeviceKey(liveSessionId, deviceId);
  const existing = await loadLocalAnswers(liveSessionId, deviceId);
  const revisions = { ...(existing?.revisions ?? {}) };
  const now = Date.now();

  if (changedQuestionIds?.length) {
    for (const qid of changedQuestionIds) {
      revisions[qid] = (revisions[qid] ?? 0) + 1;
    }
  } else {
    for (const qid of Object.keys(answers)) {
      revisions[qid] = (revisions[qid] ?? 0) + 1;
    }
  }

  const record: LocalAnswerRecord = {
    key,
    liveSessionId,
    deviceId: deviceId.toLowerCase(),
    answers,
    updatedAt: now,
    revisions,
  };
  await idbPut("answers", record);
}

/** Last-write-wins per question using revision counters. */
export function mergeAnswersLastWrite(
  local: StudentAnswers,
  localRevisions: Record<string, number>,
  remote: StudentAnswers,
  remoteRevisions: Record<string, number>,
): StudentAnswers {
  const merged = { ...remote };
  for (const [qid, value] of Object.entries(local)) {
    const localRev = localRevisions[qid] ?? 0;
    const remoteRev = remoteRevisions[qid] ?? 0;
    if (localRev >= remoteRev) {
      merged[qid] = value;
    }
  }
  return merged;
}
