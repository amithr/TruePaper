import type { StudentAnswers } from "@/lib/forms";
import { broadcastTeacherWatchAnswerDraft } from "@/lib/broadcast-exam-drafts";
import { broadcastLiveSessionAnswerDraft } from "@/lib/broadcast-live-session-overview";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

/** Best-effort push so teacher watch + exam list show typing before autosave. */
export async function notifyTeacherWatchAnswerDraft(
  liveSessionId: string,
  deviceId: string,
  answers: StudentAnswers,
): Promise<void> {
  if (!liveSessionId.trim() || !deviceId.trim()) {
    return;
  }
  try {
    const supabase = createBrowserSupabaseClient();
    await Promise.allSettled([
      broadcastTeacherWatchAnswerDraft(supabase, liveSessionId, deviceId, answers),
      broadcastLiveSessionAnswerDraft(supabase, liveSessionId, deviceId, answers),
    ]);
  } catch {
    /* postgres / watch_refresh may still deliver after save */
  }
}
