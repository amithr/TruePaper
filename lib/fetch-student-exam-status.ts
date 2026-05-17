import { parseLiveSessionStudentGet } from "@/lib/live-session-student-get";

/** Event-driven status check (suspended/finished only — does not load answers). */
export async function fetchStudentExamStatus(
  liveSessionId: string,
  deviceId: string,
): Promise<{ suspended: boolean; finished: boolean } | null> {
  try {
    const params = new URLSearchParams({ deviceId });
    const response = await fetch(
      `/api/public/live-sessions/${liveSessionId}/responses?${params.toString()}`,
    );
    const raw = (await response.json()) as unknown;
    if (!response.ok) {
      return null;
    }
    const parsed = parseLiveSessionStudentGet(raw);
    return { suspended: parsed.suspended, finished: parsed.finished };
  } catch {
    return null;
  }
}
