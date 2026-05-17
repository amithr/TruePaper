import { broadcastStudentExamPatch } from "@/lib/student-exam-channel";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

/** Best-effort push so the student's tab unpauses even if server-side broadcast failed. */
export async function notifyStudentExamResumed(
  liveSessionId: string,
  deviceId: string,
): Promise<void> {
  try {
    const supabase = createBrowserSupabaseClient();
    await broadcastStudentExamPatch(supabase, liveSessionId, deviceId, { suspended: false });
  } catch {
    /* postgres realtime may still deliver the update */
  }
}
