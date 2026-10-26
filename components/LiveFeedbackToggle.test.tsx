import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LiveFeedbackToggle } from "@/components/LiveFeedbackToggle";
import { renderWithI18n } from "@/lib/test/render-i18n";

const requestJson = vi.fn();
const toast = { success: vi.fn(), error: vi.fn() };

vi.mock("@/lib/request-json", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/request-json")>()),
  requestJson: (...args: unknown[]) => requestJson(...args),
}));
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => toast.success(...a), error: (...a: unknown[]) => toast.error(...a) } }));

describe("LiveFeedbackToggle", () => {
  beforeEach(() => {
    requestJson.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it("banner: offers to turn feedback on and saves it on the form", async () => {
    requestJson.mockResolvedValue({ ok: true });
    const onChanged = vi.fn();
    renderWithI18n(<LiveFeedbackToggle variant="banner" formId="f1" enabled={false} onChanged={onChanged} />);
    fireEvent.click(screen.getByTestId("live-feedback-turn-on"));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(true));
    expect(requestJson).toHaveBeenCalledWith(
      "/api/forms/f1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ liveTeacherFeedbackEnabled: true }) }),
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it("banner renders nothing once feedback is on", () => {
    renderWithI18n(<LiveFeedbackToggle variant="banner" formId="f1" enabled onChanged={vi.fn()} />);
    expect(screen.queryByTestId("live-feedback-banner")).not.toBeInTheDocument();
  });

  it("menu: a checkbox that can also turn feedback off, and keeps state on failure", async () => {
    requestJson.mockRejectedValueOnce(new Error("nope"));
    const onChanged = vi.fn();
    renderWithI18n(<LiveFeedbackToggle variant="menu" formId="f1" enabled onChanged={onChanged} />);
    const box = screen.getByRole("checkbox");
    expect(box).toBeChecked();
    fireEvent.click(box);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onChanged).not.toHaveBeenCalled();
  });
});
