import { parseLiveTeacherFeedback, type LiveTeacherFeedbackByQuestionId } from "@/lib/live-teacher-feedback";

/** Event-driven pull of teacher comments (no polling loop). */
export async function fetchStudentLiveTeacherFeedback(
  liveSessionId: string,
  deviceId: string,
): Promise<LiveTeacherFeedbackByQuestionId | null> {
  try {
    const params = new URLSearchParams({ deviceId });
    const response = await fetch(
      `/api/public/live-sessions/${liveSessionId}/feedback?${params.toString()}`,
    );
    const raw = (await response.json()) as {
      enabled?: boolean;
      liveTeacherFeedback?: unknown;
      error?: string;
    };
    if (!response.ok) {
      return null;
    }
    if (raw.enabled === false) {
      return {};
    }
    return parseLiveTeacherFeedback(raw.liveTeacherFeedback);
  } catch {
    return null;
  }
}
