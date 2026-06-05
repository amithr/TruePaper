import type { Form } from "@/lib/forms";
import { EXAM_SHELL_BUDGET_BYTES, type DeliveryMode } from "@/lib/offline/config";
import { idbGet, idbPut, sessionDeviceKey } from "@/lib/offline/idb";
import type { CachedExamSession } from "@/lib/offline/types";

export function estimatePayloadBytes(payload: unknown): number {
  try {
    return new Blob([JSON.stringify(payload)]).size;
  } catch {
    return 0;
  }
}

export async function cacheExamSession(input: {
  liveSessionId: string;
  deviceId: string;
  joinCode: string;
  displayName: string;
  form: Form;
  deliveryMode?: DeliveryMode;
}): Promise<{ ok: boolean; bytes: number; overBudget: boolean }> {
  const bytes = estimatePayloadBytes(input.form);
  const overBudget = bytes > EXAM_SHELL_BUDGET_BYTES;
  const record: CachedExamSession = {
    key: sessionDeviceKey(input.liveSessionId, input.deviceId),
    liveSessionId: input.liveSessionId,
    deviceId: input.deviceId.toLowerCase(),
    joinCode: input.joinCode,
    displayName: input.displayName,
    form: input.form,
    deliveryMode: input.deliveryMode ?? "live",
    cachedAt: Date.now(),
  };
  await idbPut("session_cache", record);
  return { ok: true, bytes, overBudget };
}

export async function loadCachedExamSession(
  liveSessionId: string,
  deviceId: string,
): Promise<CachedExamSession | null> {
  return idbGet<CachedExamSession>("session_cache", sessionDeviceKey(liveSessionId, deviceId));
}
