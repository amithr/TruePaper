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
    lastSeenAt: null,
    syncState: "synced",
    pendingSyncCount: 0,
    handRaiseQuestionId: null,
    handRaisedAt: null,
    updatedAt: "2026-06-05T12:00:00.000Z",
    ...overrides,
  };
}

describe("SessionExamRoster", () => {
  it("shows offline wifi icon", () => {
    renderWithI18n(
      <SessionExamRoster
        previewQuestions={[]}
        participants={[participant({ syncState: "offline" })]}
        liveDraftsByDevice={{}}
        onOpenExam={vi.fn()}
      />,
    );
    const badge = screen.getByTestId("roster-sync-badge");
    expect(badge).toHaveAttribute("data-sync-state", "offline");
    expect(badge).toHaveAttribute("aria-label", "Offline");
  });

  it("shows amber wifi while a student's answers are syncing", () => {
    renderWithI18n(
      <SessionExamRoster
        previewQuestions={[]}
        participants={[participant({ syncState: "pending", pendingSyncCount: 4 })]}
        liveDraftsByDevice={{}}
        onOpenExam={vi.fn()}
      />,
    );
    const badge = screen.getByTestId("roster-sync-badge");
    expect(badge).toHaveAttribute("data-sync-state", "pending");
    expect(badge).toHaveAttribute("aria-label", "Saving…");
  });

  it("shows green wifi for online synced students", () => {
    renderWithI18n(
      <SessionExamRoster
        previewQuestions={[]}
        participants={[participant({ syncState: "synced" })]}
        liveDraftsByDevice={{}}
        onOpenExam={vi.fn()}
      />,
    );
    const badge = screen.getByTestId("roster-sync-badge");
    expect(badge).toHaveAttribute("data-sync-state", "online");
    expect(badge).toHaveAttribute("aria-label", "Online");
  });

  it("hides wifi icon after submission", () => {
    renderWithI18n(
      <SessionExamRoster
        previewQuestions={[]}
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

  it("shows live draft text under the student name", () => {
    renderWithI18n(
      <SessionExamRoster
        previewQuestions={[{ id: "q1", type: "extendedWritten" }]}
        participants={[participant({ status: "started" })]}
        liveDraftsByDevice={{
          [TEST_DEVICE_ID.toLowerCase()]: { q1: "Draft answer in progress" },
        }}
        onOpenExam={vi.fn()}
      />,
    );
    expect(screen.getByText("Draft answer in progress")).toBeInTheDocument();
  });

  it("shows status chips for working, idle, and submitted students", () => {
    renderWithI18n(
      <SessionExamRoster
        previewQuestions={[]}
        participants={[
          participant({ status: "started", displayName: "Working Student" }),
          participant({
            anonymousSessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            status: "idle",
            displayName: "Idle Student",
          }),
          participant({
            anonymousSessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            finishedAt: "2026-06-05T12:05:00.000Z",
            status: "finished",
            displayName: "Done Student",
          }),
        ]}
        liveDraftsByDevice={{}}
        onOpenExam={vi.fn()}
      />,
    );

    expect(screen.getByText("Working")).toBeInTheDocument();
    expect(screen.getByText("Idle")).toBeInTheDocument();
    expect(screen.getByText("Submitted")).toBeInTheDocument();
    expect(screen.getAllByTestId("roster-status-badge")).toHaveLength(3);
  });
});
