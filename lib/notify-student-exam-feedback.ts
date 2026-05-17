import type { LiveTeacherFeedbackByQuestionId } from "@/lib/live-teacher-feedback";
import { broadcastStudentExamPatch } from "@/lib/student-exam-channel";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

/** Best-effort push so the student's tab shows new comments immediately. */
export async function notifyStudentExamFeedback(
  liveSessionId: string,
  deviceId: string,
  liveTeacherFeedback: LiveTeacherFeedbackByQuestionId,
): Promise<void> {
  const deviceNorm = deviceId.trim().toLowerCase();
  if (!deviceNorm) {
    return;
  }
  try {
    const supabase = createBrowserSupabaseClient();
    await broadcastStudentExamPatch(supabase, liveSessionId, deviceNorm, {
      liveTeacherFeedback,
    });
  } catch {
    /* postgres realtime or feedback fetch may still deliver the update */
  }
}
