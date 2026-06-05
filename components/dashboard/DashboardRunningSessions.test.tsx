import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DashboardRunningSessions } from "@/components/dashboard/DashboardRunningSessions";
import type { TeacherSessionSummary } from "@/lib/teacher-sessions";
import { renderWithI18n } from "@/lib/test/render-i18n";

vi.mock("@/lib/use-polling-refresh", () => ({
  usePollingRefresh: () => undefined,
}));

vi.mock("@/lib/request-json", () => ({
  requestJson: vi.fn(),
}));

const session: TeacherSessionSummary = {
  id: "session-1",
  formId: "form-1",
  formTitle: "Algebra Quiz",
  joinCode: "ABCDEF",
  opensAt: new Date(Date.now() - 60_000).toISOString(),
  closesAt: new Date(Date.now() + 45 * 60_000).toISOString(),
  createdAt: new Date().toISOString(),
  assignedCount: 12,
  inProgressCount: 4,
  finishedCount: 3,
  needsGradingCount: 1,
  responseCount: 12,
};

describe("DashboardRunningSessions", () => {
  it("renders active session join code and counts", () => {
    renderWithI18n(
      <DashboardRunningSessions
        initialSessions={[session]}
        initialSuspensions={{}}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByText("Algebra Quiz")).toBeInTheDocument();
    expect(screen.getByText("ABCDEF")).toBeInTheDocument();
    expect(screen.getByText("4 working")).toBeInTheDocument();
    expect(screen.getByText("12 joined")).toBeInTheDocument();
  });

  it("shows empty state when no sessions", () => {
    renderWithI18n(
      <DashboardRunningSessions initialSessions={[]} initialSuspensions={{}} onError={vi.fn()} />,
    );
    expect(screen.getByText(/no sessions are open/i)).toBeInTheDocument();
  });
});
