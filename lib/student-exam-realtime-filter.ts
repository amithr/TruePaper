function hasStoredLiveTeacherFeedback(row: Record<string, unknown>): boolean {
  const raw = row.live_teacher_feedback;
  if (raw === null || raw === undefined) {
    return false;
  }
  return JSON.stringify(raw) !== "{}";
}

/** Skip postgres payloads that only reflect answer autosave or presence heartbeats. */
export function isAnswersOnlyFormResponseUpdate(
  oldRow: Record<string, unknown> | undefined,
  newRow: Record<string, unknown>,
): boolean {
  if (!oldRow || Object.keys(oldRow).length === 0) {
    if (hasStoredLiveTeacherFeedback(newRow)) {
      return false;
    }
    if (newRow.suspended_at != null || newRow.finished_at != null) {
      return false;
    }
    if (newRow.student_resume_code != null && newRow.student_resume_code !== "") {
      return false;
    }
    return true;
  }

  const answersChanged =
    JSON.stringify(oldRow.answers) !== JSON.stringify(newRow.answers);
  const feedbackChanged =
    JSON.stringify(oldRow.live_teacher_feedback) !==
    JSON.stringify(newRow.live_teacher_feedback);
  const suspendedSame = oldRow.suspended_at === newRow.suspended_at;
  const finishedSame = oldRow.finished_at === newRow.finished_at;
  const resumeSame = oldRow.student_resume_code === newRow.student_resume_code;

  if (feedbackChanged) {
    return false;
  }

  if (answersChanged) {
    return suspendedSame && finishedSame && resumeSame;
  }

  return suspendedSame && finishedSame && resumeSame;
}
