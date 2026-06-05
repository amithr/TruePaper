import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DashboardPastSessions } from "@/components/dashboard/DashboardPastSessions";
import { renderWithI18n } from "@/lib/test/render-i18n";

const requestJson = vi.fn();

vi.mock("@/lib/i18n/client", () => ({
  useLocaleRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/request-json", () => ({
  requestJson: (...args: unknown[]) => requestJson(...args),
}));

describe("DashboardPastSessions", () => {
  it("shows empty state when no past sessions", async () => {
    requestJson.mockResolvedValue({ sessions: [], total: 0, page: 0 });

    renderWithI18n(<DashboardPastSessions onError={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/no sessions yet/i)).toBeInTheDocument();
    });
  });

  it("renders past session rows", async () => {
    requestJson.mockResolvedValue({
      sessions: [
        {
          id: "past-1",
          formId: "form-1",
          formTitle: "History Final",
          joinCode: "ABCDEF",
          opensAt: "2026-01-01T00:00:00.000Z",
          closesAt: "2026-01-01T01:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
          assignedCount: 5,
          inProgressCount: 0,
          finishedCount: 5,
          needsGradingCount: 0,
          responseCount: 5,
        },
      ],
      total: 1,
      page: 0,
    });

    renderWithI18n(<DashboardPastSessions onError={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("History Final")).toBeInTheDocument();
      expect(screen.getByText("ABCDEF")).toBeInTheDocument();
    });
  });
});
