import type { SupabaseClient } from "@supabase/supabase-js";

/** Clears a raised hand after the teacher responds (best-effort). */
export async function clearStudentHandRaise(
  supabase: SupabaseClient,
  liveSessionId: string,
  deviceId: string,
  questionId?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("clear_student_hand_raise", {
    p_live_session_id: liveSessionId,
    p_device_id: deviceId.toLowerCase(),
    p_question_id: questionId ?? null,
  });
  if (
    error &&
    !error.message.includes("clear_student_hand_raise") &&
    error.code !== "42883"
  ) {
    throw error;
  }
}
