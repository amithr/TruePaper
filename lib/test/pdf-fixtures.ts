import type { ExamPdfSession, ExamPdfStudent } from "@/lib/exam-pdf-load";
import type { Form } from "@/lib/forms";
import { TEST_DEVICE_ID, TEST_LIVE_SESSION_ID } from "@/lib/test/fixtures";

export const PDF_LOADED_SESSION = {
  session: {
    id: TEST_LIVE_SESSION_ID,
    joinCode: "ABCDEF",
    opensAt: "2026-06-05T10:00:00.000Z",
    closesAt: "2026-06-05T11:00:00.000Z",
    formTitle: "Algebra Quiz",
  } satisfies ExamPdfSession,
  form: {
    id: "form-1",
    title: "Algebra Quiz",
    description: "",
    descriptionImagePath: null,
    createdBy: "teacher-1",
    liveTeacherFeedbackEnabled: false,
    questions: [],
  } satisfies Form,
};

export const PDF_STUDENT: ExamPdfStudent = {
  anonymousSessionId: TEST_DEVICE_ID,
  displayName: "Ada Lovelace",
  suspended: false,
  finished: true,
  graded: false,
  gradedAt: null,
  finishedAt: "2026-06-05T10:45:00.000Z",
  lastActivityAt: "2026-06-05T10:44:00.000Z",
  hasJoined: true,
  answers: {},
  liveTeacherFeedback: {},
  questionGrades: {},
  pointsEarned: null,
  pointsPossible: 0,
};
