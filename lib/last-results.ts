/**
 * The exam this device last handed in, so the hand-in screen (and /join later)
 * can show "your results" — the results token is the only way back from
 * another device, so it's offered for copying as soon as it exists.
 */
export type LastResults = {
  liveSessionId: string;
  deviceId: string;
  displayName: string;
  formTitle: string;
  finishedAt: number;
  /** Null until claimed (offline hand-in, or the teacher ended the exam remotely). */
  token: string | null;
};

export const LAST_RESULTS_STORAGE_KEY = "truepaper_last_results";

function isLastResults(value: unknown): value is LastResults {
  if (!value || typeof value !== "object") {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.liveSessionId === "string" &&
    typeof v.deviceId === "string" &&
    typeof v.displayName === "string" &&
    typeof v.formTitle === "string" &&
    typeof v.finishedAt === "number" &&
    (typeof v.token === "string" || v.token === null)
  );
}

export function saveLastResults(entry: LastResults): void {
  try {
    window.localStorage.setItem(LAST_RESULTS_STORAGE_KEY, JSON.stringify(entry));
  } catch {
    /* storage unavailable — the hand-in screen just shows the plain card */
  }
}

export function loadLastResults(): LastResults | null {
  try {
    const raw = window.localStorage.getItem(LAST_RESULTS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!isLastResults(parsed)) {
      if (parsed !== null) {
        clearLastResults();
      }
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearLastResults(): void {
  try {
    window.localStorage.removeItem(LAST_RESULTS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
