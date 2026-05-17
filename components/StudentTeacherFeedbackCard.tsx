type Props = {
  message: string;
};

/** Shown under each text answer when live teacher feedback is enabled for the form. */
export function StudentTeacherFeedbackCard({ message }: Props) {
  const trimmed = message.trim();

  return (
    <aside className="tp-teacher-feedback-card" role="status" aria-live="polite" aria-atomic="true">
      <p className="tp-teacher-feedback-card__title">Teacher feedback</p>
      {trimmed ? (
        <p
          data-testid="student-teacher-feedback-body"
          className="tp-teacher-feedback-card__body whitespace-pre-wrap"
        >
          {message}
        </p>
      ) : (
        <p className="tp-teacher-feedback-card__placeholder">
          Your teacher can leave comments here as you work. Check back in a moment.
        </p>
      )}
    </aside>
  );
}
