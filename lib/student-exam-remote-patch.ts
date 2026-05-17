import { parseLiveTeacherFeedback, type LiveTeacherFeedbackByQuestionId } from "@/lib/live-teacher-feedback";

export type StudentExamRemotePatch = {
  liveTeacherFeedback?: LiveTeacherFeedbackByQuestionId;
  suspended?: boolean;
  finished?: boolean;
  resumeCode?: string | null;
};

/** Maps a form_responses row to student UI fields. Never includes answers (local state is authoritative). */
export function studentExamRemotePatchFromRow(row: Record<string, unknown>): StudentExamRemotePatch {
  const patch: StudentExamRemotePatch = {};

  if ("live_teacher_feedback" in row) {
    patch.liveTeacherFeedback = parseLiveTeacherFeedback(row.live_teacher_feedback);
  }
  if ("suspended_at" in row) {
    patch.suspended = row.suspended_at != null;
  }
  if ("finished_at" in row) {
    patch.finished = row.finished_at != null;
  }
  if ("student_resume_code" in row) {
    const code = row.student_resume_code;
    patch.resumeCode = typeof code === "string" && code.trim() ? code.trim().toUpperCase() : null;
  }

  return patch;
}
