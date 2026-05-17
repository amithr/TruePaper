import { broadcastStudentFeedbackDraft } from "@/lib/broadcast-exam-drafts";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

/** Best-effort push so the student sees teacher comments while they type. */
export async function notifyStudentFeedbackDraft(
  liveSessionId: string,
  deviceId: string,
  questionId: string,
  message: string,
): Promise<void> {
  if (!liveSessionId.trim() || !deviceId.trim() || !questionId.trim()) {
    return;
  }
  try {
    const supabase = createBrowserSupabaseClient();
    await broadcastStudentFeedbackDraft(supabase, liveSessionId, deviceId, questionId, message);
  } catch {
    /* saved feedback broadcast / postgres may still deliver */
  }
}
