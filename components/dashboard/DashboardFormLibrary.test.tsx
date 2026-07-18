import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DashboardFormLibrary } from "@/components/dashboard/DashboardFormLibrary";
import { renderWithI18n } from "@/lib/test/render-i18n";

const requestJson = vi.fn();

vi.mock("@/lib/i18n/client", () => ({
  useLocaleRouter: () => ({ push: vi.fn() }),
  LocaleLink: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/request-json", () => ({
  requestJson: (...args: unknown[]) => requestJson(...args),
}));

describe("DashboardFormLibrary", () => {
  it("loads and lists teacher forms", async () => {
    requestJson.mockResolvedValue({
      forms: [
        {
          id: "form-1",
          title: "Biology Unit 1",
          description: "Cells",
          descriptionImagePath: null,
          createdBy: "t1",
          liveTeacherFeedbackEnabled: false,
          questions: [],
          questionCount: 3,
          autogradeCount: 2,
          lastRunAt: null,
          lastSessionDefaults: null,
        },
      ],
    });

    renderWithI18n(<DashboardFormLibrary onError={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Biology Unit 1")).toBeInTheDocument();
    });
    expect(screen.getByText(/3 questions/i)).toBeInTheDocument();
    expect(screen.getByText(/2\/3 auto-graded/i)).toBeInTheDocument();
    expect(screen.getByText(/Never run/i)).toBeInTheDocument();
    expect(requestJson).toHaveBeenCalledWith("/api/forms?summary=1");
  });
});

