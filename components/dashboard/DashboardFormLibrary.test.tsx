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
          createdBy: "t1",
          liveTeacherFeedbackEnabled: false,
          questions: [],
          questionCount: 3,
        },
      ],
    });

    renderWithI18n(<DashboardFormLibrary onError={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Biology Unit 1")).toBeInTheDocument();
    });
    expect(requestJson).toHaveBeenCalledWith("/api/forms?summary=1");
  });
});
