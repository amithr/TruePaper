import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SessionExamRoster } from "@/components/SessionExamRoster";
import type { LiveSessionOverviewParticipant } from "@/lib/live-session-overview";
import { TEST_DEVICE_ID } from "@/lib/test/fixtures";
import { renderWithI18n } from "@/lib/test/render-i18n";

function participant(
  overrides: Partial<LiveSessionOverviewParticipant> = {},
): LiveSessionOverviewParticipant {
  return {
    anonymousSessionId: TEST_DEVICE_ID,
    displayName: "Ada Lovelace",
    status: "idle",
    suspendedAt: null,
    finishedAt: null,
    gradedAt: null,
    pointsEarned: null,
    pointsPossible: null,
    answeredCount: 1,
    textPreview: "",
    textWordCount: 0,
    lastActivityAt: "2026-06-05T12:00:00.000Z",
    lastTypingAt: null,
    lastSeenAt: "2026-06-05T12:00:00.000Z",
    syncState: "synced",
    pendingSyncCount: 0,
    handRaiseQuestionId: null,
    handRaisedAt: null,
    focusQuestionId: null,
    updatedAt: "2026-06-05T12:00:00.000Z",
    ...overrides,
  };
}

const previewQuestions = [
  { id: "q1", type: "extendedWritten" as const },
  { id: "q2", type: "shortAnswer" as const },
];

describe("SessionExamRoster", () => {
  it("shows offline status without a wifi badge", () => {
    renderWithI18n(
      <SessionExamRoster
        previewQuestions={previewQuestions}
        questionTotal={2}
        participants={[participant({ syncState: "offline" })]}
        liveDraftsByDevice={{}}
        onOpenExam={vi.fn()}
        activityNowMs={Date.parse("2026-06-05T12:00:00.000Z")}
      />,
    );
    expect(screen.queryByTestId("roster-sync-badge")).not.toBeInTheDocument();
    expect(screen.getByTestId("roster-status-line")).toHaveTextContent(
      "Offline — answers will sync",
    );
  });

  it("shows waiting status and Let in for suspended students", () => {
    renderWithI18n(
      <SessionExamRoster
        previewQuestions={previewQuestions}
        questionTotal={2}
        participants={[
          participant({
            suspendedAt: "2026-06-05T11:55:00.000Z",
            status: "blocked",
          }),
        ]}
        liveDraftsByDevice={{}}
        onOpenExam={vi.fn()}
        onResumeStudent={vi.fn()}
        activityNowMs={Date.parse("2026-06-05T12:00:00.000Z")}
      />,
    );
    expect(screen.getByTestId("roster-status-line")).toHaveTextContent(
      "Left the tab — waiting to re-enter",
    );
    expect(screen.getByTestId("roster-let-in")).toHaveTextContent("Let in");
  });

  it("shows working-on question from focusQuestionId", () => {
    renderWithI18n(
      <SessionExamRoster
        previewQuestions={previewQuestions}
        questionTotal={2}
        participants={[
          participant({
            status: "started",
            focusQuestionId: "q2",
            answeredCount: 1,
          }),
        ]}
        liveDraftsByDevice={{}}
        onOpenExam={vi.fn()}
        activityNowMs={Date.parse("2026-06-05T12:00:00.000Z")}
      />,
    );
    expect(screen.getByTestId("roster-status-line")).toHaveTextContent("Working on Q2");
    expect(screen.getByText("1/2 ans.")).toBeInTheDocument();
  });

  it("shows handed-in status without wifi after submission", () => {
    renderWithI18n(
      <SessionExamRoster
        previewQuestions={previewQuestions}
        questionTotal={2}
        participants={[
          participant({
            finishedAt: "2026-06-05T12:05:00.000Z",
            syncState: "offline",
            pendingSyncCount: 2,
            answeredCount: 2,
          }),
        ]}
        liveDraftsByDevice={{}}
        onOpenExam={vi.fn()}
        activityNowMs={Date.parse("2026-06-05T12:06:00.000Z")}
      />,
    );
    expect(screen.queryByTestId("roster-sync-badge")).not.toBeInTheDocument();
    expect(screen.getByTestId("roster-status-line")).toHaveTextContent(/Handed in/);
  });

  it("does not show live draft text in the row subtitle", () => {
    renderWithI18n(
      <SessionExamRoster
        previewQuestions={previewQuestions}
        questionTotal={2}
        participants={[participant({ status: "started", focusQuestionId: "q1" })]}
        liveDraftsByDevice={{
          [TEST_DEVICE_ID.toLowerCase()]: { q1: "Draft answer in progress" },
        }}
        onOpenExam={vi.fn()}
        activityNowMs={Date.parse("2026-06-05T12:00:00.000Z")}
      />,
    );
    expect(screen.queryByText("Draft answer in progress")).not.toBeInTheDocument();
    expect(screen.getByTestId("roster-status-line")).toHaveTextContent("Working on Q1");
  });
});
