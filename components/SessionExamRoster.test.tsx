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
    answeredCount: 0,
    textPreview: "",
    textWordCount: 0,
    lastActivityAt: null,
    lastTypingAt: null,
    syncState: "synced",
    pendingSyncCount: 0,
    updatedAt: "2026-06-05T12:00:00.000Z",
    ...overrides,
  };
}

describe("SessionExamRoster", () => {
  it("shows offline sync badge", () => {
    renderWithI18n(
      <SessionExamRoster
        textQuestionIds={[]}
        participants={[participant({ syncState: "offline" })]}
        liveDraftsByDevice={{}}
        onOpenExam={vi.fn()}
      />,
    );
    const badge = screen.getByTestId("roster-sync-badge");
    expect(badge).toHaveAttribute("data-sync-state", "offline");
  });

  it("shows pending sync badge with count", () => {
    renderWithI18n(
      <SessionExamRoster
        textQuestionIds={[]}
        participants={[participant({ syncState: "pending", pendingSyncCount: 4 })]}
        liveDraftsByDevice={{}}
        onOpenExam={vi.fn()}
      />,
    );
    const badge = screen.getByTestId("roster-sync-badge");
    expect(badge).toHaveAttribute("data-sync-state", "pending");
    expect(badge.textContent).toMatch(/4/);
  });

  it("hides sync badge after submission", () => {
    renderWithI18n(
      <SessionExamRoster
        textQuestionIds={[]}
        participants={[
          participant({
            finishedAt: "2026-06-05T12:05:00.000Z",
            syncState: "offline",
            pendingSyncCount: 2,
          }),
        ]}
        liveDraftsByDevice={{}}
        onOpenExam={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("roster-sync-badge")).not.toBeInTheDocument();
  });
});
