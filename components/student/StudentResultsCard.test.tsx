import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudentResultsCard, RESULTS_POLL_INTERVAL_MS } from "@/components/student/StudentResultsCard";
import { renderWithI18n } from "@/lib/test/render-i18n";

vi.mock("@/lib/i18n/client", () => ({
  LocaleLink: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const copyToClipboard = vi.fn();
vi.mock("@/lib/copy-to-clipboard", () => ({ copyToClipboard: (text: string) => copyToClipboard(text) }));

function jsonResponse(review: Record<string, unknown>) {
  return new Response(JSON.stringify({ review }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("StudentResultsCard", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    copyToClipboard.mockReset().mockResolvedValue(true);
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("waits while marking, then shows the score and the results link", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ graded: false, sessionOpen: true, pointsEarned: null, pointsPossible: null }))
      .mockResolvedValueOnce(jsonResponse({ graded: true, sessionOpen: true, pointsEarned: 7, pointsPossible: 10 }))
      .mockResolvedValueOnce(jsonResponse({ graded: true, sessionOpen: false, pointsEarned: 7, pointsPossible: 10 }));
    renderWithI18n(<StudentResultsCard token="ABCDEFGH2345" />);
    await act(async () => {});
    expect(screen.getByTestId("student-results-card")).toHaveAttribute("data-state", "waiting");
    expect(screen.getByText("Your teacher is marking it")).toBeInTheDocument();
    expect(screen.queryByTestId("student-results-open")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/public/review/ABCDEFGH2345");

    // Auto-graded but the exam window is still open: keep waiting.
    await act(async () => {
      vi.advanceTimersByTime(RESULTS_POLL_INTERVAL_MS);
    });
    await act(async () => {});
    expect(screen.getByTestId("student-results-card")).toHaveAttribute("data-state", "waiting");

    await act(async () => {
      vi.advanceTimersByTime(RESULTS_POLL_INTERVAL_MS);
    });
    await act(async () => {});
    expect(screen.getByTestId("student-results-card")).toHaveAttribute("data-state", "ready");
    expect(screen.getByTestId("student-results-score")).toHaveTextContent("7 out of 10");
    expect(screen.getByTestId("student-results-open")).toHaveAttribute("href", "/review/ABCDEFGH2345");

    // Ready: polling stops.
    const calls = fetchMock.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(RESULTS_POLL_INTERVAL_MS * 2);
    });
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it("copies the results link", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ graded: false, sessionOpen: true, pointsEarned: null, pointsPossible: null }));
    renderWithI18n(<StudentResultsCard token="ABCDEFGH2345" />);
    await act(async () => {});
    fireEvent.click(screen.getByTestId("student-results-copy"));
    await act(async () => {});
    expect(copyToClipboard).toHaveBeenCalledWith(`${window.location.origin}/review/ABCDEFGH2345`);
    expect(screen.getByTestId("student-results-copy")).toHaveTextContent("Link copied");
  });
});
