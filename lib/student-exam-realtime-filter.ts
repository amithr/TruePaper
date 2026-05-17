/** Skip postgres payloads that only reflect answer autosave or presence heartbeats. */
export function isAnswersOnlyFormResponseUpdate(
  oldRow: Record<string, unknown> | undefined,
  newRow: Record<string, unknown>,
): boolean {
  if (!oldRow) {
    return true;
  }

  const answersChanged = JSON.stringify(oldRow.answers) !== JSON.stringify(newRow.answers);
  const suspendedSame = oldRow.suspended_at === newRow.suspended_at;
  const finishedSame = oldRow.finished_at === newRow.finished_at;
  const feedbackSame =
    JSON.stringify(oldRow.live_teacher_feedback) === JSON.stringify(newRow.live_teacher_feedback);
  const resumeSame = oldRow.student_resume_code === newRow.student_resume_code;

  if (!answersChanged && suspendedSame && finishedSame && feedbackSame && resumeSame) {
    return true;
  }

  if (!answersChanged) {
    return true;
  }

  return suspendedSame && finishedSame && feedbackSame && resumeSame;
}
