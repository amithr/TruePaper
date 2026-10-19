import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DashboardFormLibrary } from "@/components/dashboard/DashboardFormLibrary";
import { renderWithI18n } from "@/lib/test/render-i18n";

const requestJson = vi.fn();
const push = vi.fn();

vi.mock("@/lib/i18n/client", () => ({
  useLocaleRouter: () => ({ push }),
  LocaleLink: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/request-json", () => ({
  requestJson: (...args: unknown[]) => requestJson(...args),
}));

const sampleForm = {
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
};

describe("DashboardFormLibrary", () => {
  it("loads and lists teacher forms", async () => {
    requestJson.mockResolvedValue({ forms: [sampleForm] });

    renderWithI18n(<DashboardFormLibrary onError={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Biology Unit 1")).toBeInTheDocument();
    });
    expect(screen.getByText(/3 questions/i)).toBeInTheDocument();
    expect(screen.getByText(/2\/3 auto-graded/i)).toBeInTheDocument();
    expect(screen.getByText(/Never run/i)).toBeInTheDocument();
    expect(requestJson).toHaveBeenCalledWith("/api/forms?summary=1");
  });

  it("opens the Get link tab from Copy start link without the menu close wiping it", async () => {
    requestJson.mockResolvedValue({ forms: [sampleForm] });

    renderWithI18n(<DashboardFormLibrary onError={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Biology Unit 1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /More actions/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Copy start link/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /Teacher start link/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Copy link/i })).toBeInTheDocument();
  });

  describe("New form menu", () => {
    const openMenu = async () => {
      requestJson.mockResolvedValue({ forms: [sampleForm] });
      renderWithI18n(<DashboardFormLibrary onError={vi.fn()} />);
      await waitFor(() => expect(screen.getByText("Biology Unit 1")).toBeInTheDocument());
      const trigger = screen.getByRole("button", { name: /new form/i });
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      return trigger;
    };

    it("offers a blank form and an AI-generated one", async () => {
      await openMenu();
      const items = screen.getAllByRole("menuitem");
      expect(items.map((item) => item.textContent)).toEqual([
        expect.stringContaining("Blank form"),
        expect.stringContaining("Create with AI"),
      ]);
    });

    it("Blank form creates a form and opens it in the builder", async () => {
      await openMenu();
      requestJson.mockResolvedValueOnce({
        form: { ...sampleForm, id: "form-new", title: "Untitled Form" },
      });
      fireEvent.click(screen.getByTestId("new-form-blank"));
      await waitFor(() => expect(push).toHaveBeenCalledWith("/?form=form-new"));
      expect(requestJson).toHaveBeenCalledWith(
        "/api/forms",
        expect.objectContaining({ method: "POST" }),
      );
      expect(screen.queryByRole("menu")).toBeNull();
    });

    it("Create with AI opens the AI guide instead of creating a form", async () => {
      await openMenu();
      requestJson.mockClear();
      fireEvent.click(screen.getByTestId("new-form-ai"));
      expect(screen.getByRole("dialog", { name: /create an exam with ai/i })).toBeInTheDocument();
      expect(requestJson).not.toHaveBeenCalled();
    });

    it("supports keyboard navigation and Escape", async () => {
      // A click without a pointer type is how Enter/Space open it: focus lands on the first option.
      const trigger = await openMenu();
      const blank = screen.getByTestId("new-form-blank");
      const ai = screen.getByTestId("new-form-ai");
      await waitFor(() => expect(blank).toHaveFocus());
      fireEvent.keyDown(blank, { key: "ArrowDown" });
      await waitFor(() => expect(ai).toHaveFocus());
      fireEvent.keyDown(ai, { key: "ArrowDown" });
      await waitFor(() => expect(blank).toHaveFocus());
      fireEvent.keyDown(blank, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      await waitFor(() => expect(trigger).toHaveFocus());
    });
  });
});
