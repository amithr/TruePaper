import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DashboardRunningSessions } from "@/components/dashboard/DashboardRunningSessions";
import type { TeacherSessionSummary } from "@/lib/teacher-sessions";
import { renderWithI18n } from "@/lib/test/render-i18n";

const push = vi.fn();

vi.mock("@/lib/i18n/client", () => ({
  useLocaleRouter: () => ({ push }),
  LocaleLink: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/use-polling-refresh", () => ({
  usePollingRefresh: () => undefined,
}));

vi.mock("@/lib/request-json", () => ({
  requestJson: vi.fn(),
}));

vi.mock("@/lib/copy-to-clipboard", () => ({
  copyToClipboard: vi.fn(async () => true),
}));

const activeSession: TeacherSessionSummary = {
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

const waitingSession: TeacherSessionSummary = {
  ...activeSession,
  id: "session-2",
  formTitle: "Waiting Exam",
  joinCode: "WAIT01",
  assignedCount: 0,
  inProgressCount: 0,
  finishedCount: 0,
  needsGradingCount: 0,
  responseCount: 0,
};

describe("DashboardRunningSessions", () => {
  it("renders active session join code, funnel pills, and open action", () => {
    renderWithI18n(
      <DashboardRunningSessions
        initialSessions={[activeSession]}
        initialSuspensions={{}}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByText("Algebra Quiz")).toBeInTheDocument();
    expect(screen.getByText("ABCDEF")).toBeInTheDocument();
    expect(screen.getByText("12 joined")).toBeInTheDocument();
    expect(screen.getByText("4 working")).toBeInTheDocument();
    expect(screen.getByText("3 done")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Refresh/i })).not.toBeInTheDocument();
  });

  it("shows waiting state instead of zero-count chips", () => {
    renderWithI18n(
      <DashboardRunningSessions
        initialSessions={[waitingSession]}
        initialSuspensions={{}}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByText(/Waiting for students/i)).toBeInTheDocument();
    expect(screen.queryByText("0 joined")).not.toBeInTheDocument();
    expect(screen.queryByText("0 working")).not.toBeInTheDocument();
  });

  it("shows empty state when no sessions", () => {
    renderWithI18n(
      <DashboardRunningSessions initialSessions={[]} initialSuspensions={{}} onError={vi.fn()} />,
    );
    expect(screen.getByText(/no sessions are open/i)).toBeInTheDocument();
  });

  it("opens the roster from the Open button", () => {
    renderWithI18n(
      <DashboardRunningSessions
        initialSessions={[activeSession]}
        initialSuspensions={{}}
        onError={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Open/i }));
    expect(push).toHaveBeenCalledWith("/dashboard/sessions/session-1");
  });
});
