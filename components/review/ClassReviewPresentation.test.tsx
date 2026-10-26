import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ClassReviewPresentation } from "@/components/review/ClassReviewPresentation";
import { serializeResponseValue } from "@/lib/response-types/answers";
import { makeQuestion } from "@/lib/test/question-fixtures";
import { renderWithI18n } from "@/lib/test/render-i18n";

const fetchSessionExam = vi.fn();
vi.mock("@/lib/review/fetch-session-exam", () => ({
  fetchSessionExam: (...args: unknown[]) => fetchSessionExam(...args),
}));
vi.mock("@/lib/i18n/client", () => ({
  LocaleLink: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/response-types/DrawingCanvas", () => ({ DrawingCanvas: () => null }));

const mc = makeQuestion("multipleChoice", { id: "q1", prompt: "Which gas?", options: ["Oxygen", "Nitrogen"], correctAnswer: "Oxygen" });
const essay = makeQuestion("extendedWritten", { id: "q2", prompt: "Explain photosynthesis." });

const data = {
  session: { id: "s1", joinCode: "ABCDEF", opensAt: "", closesAt: "", formTitle: "Biology quiz" },
  form: { id: "f1", title: "Biology quiz", description: "Answer everything.", descriptionImagePath: null, createdBy: null, liveTeacherFeedbackEnabled: false, questions: [mc, essay] },
  students: [
    { anonymousSessionId: "d1", displayName: "A", finished: true, answers: { q1: serializeResponseValue({ type: "multipleChoice", choice: "Oxygen" }), q2: "words" } },
    { anonymousSessionId: "d2", displayName: "B", finished: true, answers: { q1: serializeResponseValue({ type: "multipleChoice", choice: "Nitrogen" }) } },
    { anonymousSessionId: "d3", displayName: "C", finished: false, answers: {} },
  ],
};

describe("ClassReviewPresentation", () => {
  beforeEach(() => {
    fetchSessionExam.mockReset().mockResolvedValue(data);
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("opens on a title slide and walks through blank questions with the keyboard", async () => {
    renderWithI18n(<ClassReviewPresentation liveSessionId="s1" />);
    expect(await screen.findByTestId("review-title-slide")).toHaveTextContent("Biology quiz");
    expect(screen.getByTestId("review-counter")).toHaveTextContent("2 questions · 2 handed in");

    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => expect(screen.getByTestId("review-counter")).toHaveTextContent("Question 1 of 2"));
    expect(screen.getByText("Which gas?")).toBeInTheDocument();
    expect(window.location.hash).toBe("#q1");
    // Blank: nothing selected, and the card is inert.
    expect(screen.getAllByRole("radio").every((r) => !(r as HTMLInputElement).checked)).toBe(true);
    expect(screen.queryByTestId("review-answer-badge")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => expect(screen.getByTestId("review-counter")).toHaveTextContent("Question 2 of 2"));
    expect(screen.getByTestId("review-next")).toBeDisabled();
  });

  it("reveals the answer key only where one exists, and resets on the next slide", async () => {
    renderWithI18n(<ClassReviewPresentation liveSessionId="s1" />);
    await screen.findByTestId("review-title-slide");
    fireEvent.click(screen.getByTestId("review-next"));
    const reveal = await screen.findByTestId("review-reveal");
    expect(reveal).toBeEnabled();
    fireEvent.keyDown(window, { key: "a" });
    expect(await screen.findByTestId("review-answer-badge")).toBeInTheDocument();
    const oxygen = screen.getByRole("radio", { name: "Oxygen" }) as HTMLInputElement;
    expect(oxygen.checked).toBe(true);

    fireEvent.click(screen.getByTestId("review-next"));
    await waitFor(() => expect(screen.getByTestId("review-reveal")).toBeDisabled());
    expect(screen.queryByTestId("review-answer-badge")).not.toBeInTheDocument();
  });

  it("shows anonymous class results for the current question", async () => {
    renderWithI18n(<ClassReviewPresentation liveSessionId="s1" />);
    await screen.findByTestId("review-title-slide");
    fireEvent.click(screen.getByTestId("review-next"));
    fireEvent.keyDown(window, { key: "r" });
    const panel = await screen.findByTestId("review-results");
    expect(panel).toHaveTextContent("Based on 2 students who handed in");
    expect(panel).toHaveTextContent("Oxygen");
    expect(panel).toHaveTextContent("1 · 50%");
    expect(panel).not.toHaveTextContent("A");
    fireEvent.click(screen.getByTestId("review-next"));
    expect(screen.queryByTestId("review-results")).not.toBeInTheDocument();
  });

  it("scales the slide and remembers the size", async () => {
    renderWithI18n(<ClassReviewPresentation liveSessionId="s1" />);
    await screen.findByTestId("review-title-slide");
    const zoomBox = screen.getByTestId("review-zoom") as HTMLElement;
    expect(zoomBox.style.zoom).toBe("1.4");
    fireEvent.click(screen.getByTestId("review-zoom-in"));
    expect(zoomBox.style.zoom).toBe("1.6");
    expect(window.localStorage.getItem("truepaper_review_zoom")).toBe("1.6");
  });
});
