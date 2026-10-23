import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StudentWelcomeBackCard } from "@/components/student/StudentWelcomeBackCard";
import { TEST_DEVICE_ID, TEST_LIVE_SESSION_ID } from "@/lib/test/fixtures";
import { renderWithI18n } from "@/lib/test/render-i18n";

const loadLocalAnswers = vi.fn();
const loadCachedExamSession = vi.fn();

vi.mock("@/lib/offline/answer-store", () => ({
  loadLocalAnswers: (...args: unknown[]) => loadLocalAnswers(...args),
}));
vi.mock("@/lib/offline/session-cache", () => ({
  loadCachedExamSession: (...args: unknown[]) => loadCachedExamSession(...args),
}));

function renderCard(over: Partial<Parameters<typeof StudentWelcomeBackCard>[0]> = {}) {
  const onContinue = vi.fn();
  const onStartFresh = vi.fn();
  renderWithI18n(
    <StudentWelcomeBackCard
      displayName="Jordan Lee"
      liveSessionId={TEST_LIVE_SESSION_ID}
      deviceId={TEST_DEVICE_ID}
      onContinue={onContinue}
      onStartFresh={onStartFresh}
      {...over}
    />,
  );
  return { onContinue, onStartFresh };
}

describe("StudentWelcomeBackCard", () => {
  beforeEach(() => {
    loadLocalAnswers.mockReset();
    loadCachedExamSession.mockReset();
  });

  it("greets the student with their local progress", async () => {
    loadLocalAnswers.mockResolvedValue({ answers: { q1: "oxygen", q2: "   ", q3: "7" }, revisions: {} });
    loadCachedExamSession.mockResolvedValue({
      form: { questions: [{ id: "q1" }, { id: "q2" }, { id: "q3" }, { id: "q4" }] },
    });
    renderCard();
    expect(screen.getByText("Welcome back, Jordan Lee")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Your answers are saved — 2 of 4 answered.")).toBeInTheDocument(),
    );
  });

  it("falls back to copy without a count when nothing is cached", async () => {
    loadLocalAnswers.mockResolvedValue(null);
    loadCachedExamSession.mockResolvedValue(null);
    renderCard();
    expect(screen.getByText("Your answers are saved.")).toBeInTheDocument();
    await waitFor(() => expect(loadLocalAnswers).toHaveBeenCalled());
    expect(screen.getByText("Your answers are saved.")).toBeInTheDocument();
  });

  it("offers Continue and Not you? Start fresh", () => {
    loadLocalAnswers.mockResolvedValue(null);
    loadCachedExamSession.mockResolvedValue(null);
    const { onContinue, onStartFresh } = renderCard();
    fireEvent.click(screen.getByTestId("student-welcome-back-continue"));
    expect(onContinue).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("student-welcome-back-fresh"));
    expect(onStartFresh).toHaveBeenCalled();
  });
});
