import type { DeliveryMode } from "@/lib/offline/config";

/**
 * The exam this browser is currently taking, so a reload (or a crashed tab) can
 * put the student straight back in instead of showing the join form. Device-local
 * and best-effort: every read is validated and storage failures are ignored.
 */
export type ActiveExam = {
  liveSessionId: string;
  joinCode: string;
  displayName: string;
  /** Anonymous device id at join time; restore only when it still matches. */
  deviceId: string;
  opensAt: string;
  closesAt: string;
  deliveryMode: DeliveryMode;
  savedAt: number;
};

export const ACTIVE_EXAM_STORAGE_KEY = "truepaper_active_exam";

function isActiveExam(value: unknown): value is ActiveExam {
  if (!value || typeof value !== "object") {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.liveSessionId === "string" &&
    typeof v.joinCode === "string" &&
    typeof v.displayName === "string" &&
    typeof v.deviceId === "string" &&
    typeof v.opensAt === "string" &&
    typeof v.closesAt === "string" &&
    typeof v.deliveryMode === "string" &&
    typeof v.savedAt === "number"
  );
}

export function saveActiveExam(exam: Omit<ActiveExam, "savedAt">): void {
  try {
    window.localStorage.setItem(
      ACTIVE_EXAM_STORAGE_KEY,
      JSON.stringify({ ...exam, savedAt: Date.now() } satisfies ActiveExam),
    );
  } catch {
    /* storage unavailable — reload simply won't auto-resume */
  }
}

export function clearActiveExam(): void {
  try {
    window.localStorage.removeItem(ACTIVE_EXAM_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * The stored exam when it belongs to this device and its window hasn't closed.
 * Stale or foreign entries are cleared so they can't trigger a rejoin later.
 */
export function loadActiveExam(deviceId: string, nowMs = Date.now()): ActiveExam | null {
  let parsed: unknown = null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_EXAM_STORAGE_KEY);
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  if (!isActiveExam(parsed)) {
    if (parsed !== null) {
      clearActiveExam();
    }
    return null;
  }
  const closesAtMs = new Date(parsed.closesAt).getTime();
  const expired = Number.isFinite(closesAtMs) && nowMs > closesAtMs;
  if (expired || parsed.deviceId.toLowerCase() !== deviceId.toLowerCase()) {
    clearActiveExam();
    return null;
  }
  return parsed;
}
