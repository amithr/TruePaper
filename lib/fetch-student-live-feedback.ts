import { parseLiveTeacherFeedback, type LiveTeacherFeedbackByQuestionId } from "@/lib/live-teacher-feedback";

export type StudentLiveTeacherFeedbackSnapshot = {
  enabled: boolean;
  feedback: LiveTeacherFeedbackByQuestionId;
};

/** Event-driven pull of teacher comments (no polling loop). */
export async function fetchStudentLiveTeacherFeedback(
  liveSessionId: string,
  deviceId: string,
): Promise<StudentLiveTeacherFeedbackSnapshot | null> {
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
    return {
      enabled: raw.enabled === true,
      feedback: parseLiveTeacherFeedback(raw.liveTeacherFeedback),
    };
  } catch {
    return null;
  }
}
