import { parseLiveSessionStudentGet } from "@/lib/live-session-student-get";

export const STUDENT_ALREADY_SUBMITTED_MESSAGE =
  "You have already submitted this exam and cannot rejoin.";

/** Returns whether this device has already submitted for the live session. */
export async function fetchStudentAlreadySubmitted(
  liveSessionId: string,
  deviceId: string,
): Promise<boolean> {
  try {
    const params = new URLSearchParams({ deviceId });
    const response = await fetch(
      `/api/public/live-sessions/${liveSessionId}/responses?${params.toString()}`,
    );
    const raw = (await response.json()) as unknown;
    if (!response.ok) {
      return false;
    }
    return parseLiveSessionStudentGet(raw).finished;
  } catch {
    return false;
  }
}
