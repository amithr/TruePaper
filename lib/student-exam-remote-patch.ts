import { parseLiveTeacherFeedback, type LiveTeacherFeedbackByQuestionId } from "@/lib/live-teacher-feedback";

export type StudentExamRemotePatch = {
  liveTeacherFeedback?: LiveTeacherFeedbackByQuestionId;
  suspended?: boolean;
  finished?: boolean;
  handRaiseQuestionId?: string | null;
  handRaisedAt?: string | null;
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

  return patch;
}
