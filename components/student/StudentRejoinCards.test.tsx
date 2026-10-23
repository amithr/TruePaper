import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudentExamMovedCard } from "@/components/student/StudentExamMovedCard";
import { StudentRejoinOnNewDeviceCard } from "@/components/student/StudentRejoinOnNewDeviceCard";
import { StudentRejoinWaitingCard } from "@/components/student/StudentRejoinWaitingCard";
import type { RejoinCandidate } from "@/lib/fetch-rejoin-candidate";
import { renderWithI18n } from "@/lib/test/render-i18n";

const candidate = (over: Partial<RejoinCandidate> = {}): RejoinCandidate => ({
  found: true,
  ambiguous: false,
  answeredCount: 12,
  questionTotal: 20,
  lastActiveAt: new Date(Date.now() - 2 * 60_000).toISOString(),
  suspended: false,
  pendingRequest: false,
  ...over,
});

describe("StudentRejoinOnNewDeviceCard", () => {
  it("describes the attempt found on another device and offers both choices", () => {
    const onContinue = vi.fn();
    const onStartNew = vi.fn();
    renderWithI18n(
      <StudentRejoinOnNewDeviceCard
        displayName="Jordan Lee"
        candidate={candidate()}
        onContinue={onContinue}
        onStartNew={onStartNew}
      />,
    );
    expect(screen.getByText("Looks like Jordan Lee already started on another device")).toBeInTheDocument();
    expect(screen.getByText(/12 of 20 answered · last active 2 minutes ago/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("student-rejoin-continue"));
    expect(onContinue).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("student-rejoin-start-new"));
    expect(onStartNew).toHaveBeenCalled();
    expect(screen.getByTestId("student-rejoin-start-new")).toHaveTextContent(
      "No, I'm a different Jordan Lee — start new",
    );
  });

  it("never guesses between namesakes", () => {
    renderWithI18n(
      <StudentRejoinOnNewDeviceCard
        displayName="Sam"
        candidate={candidate({ found: false, ambiguous: true })}
        onContinue={vi.fn()}
        onStartNew={vi.fn()}
      />,
    );
    expect(screen.getByText("More than one Sam is in this session")).toBeInTheDocument();
    expect(screen.queryByTestId("student-rejoin-continue")).not.toBeInTheDocument();
    expect(screen.getByText(/personal rejoin code/)).toBeInTheDocument();
  });
});

describe("StudentRejoinWaitingCard", () => {
  it("shows the waiting state with Cancel", () => {
    const onCancel = vi.fn();
    renderWithI18n(
      <StudentRejoinWaitingCard status="pending" onCancel={onCancel} onTryAgain={vi.fn()} onStartNew={vi.fn()} />,
    );
    expect(screen.getByText("Waiting for your teacher to let you in")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("student-rejoin-cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("explains a decline and only offers a new attempt", () => {
    renderWithI18n(
      <StudentRejoinWaitingCard status="declined" onCancel={vi.fn()} onTryAgain={vi.fn()} onStartNew={vi.fn()} />,
    );
    expect(screen.getByText("Your teacher didn't approve this")).toBeInTheDocument();
    expect(screen.queryByTestId("student-rejoin-try-again")).not.toBeInTheDocument();
    expect(screen.getByTestId("student-rejoin-start-new")).toHaveTextContent("Start a new attempt");
  });

  it("lets an expired request be asked again", () => {
    const onTryAgain = vi.fn();
    renderWithI18n(
      <StudentRejoinWaitingCard status="expired" onCancel={vi.fn()} onTryAgain={onTryAgain} onStartNew={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId("student-rejoin-try-again"));
    expect(onTryAgain).toHaveBeenCalled();
  });
});

describe("StudentExamMovedCard", () => {
  it("is a terminal notice", () => {
    renderWithI18n(<StudentExamMovedCard />);
    expect(screen.getByTestId("student-exam-moved")).toHaveTextContent(
      "This exam continued on another device",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
