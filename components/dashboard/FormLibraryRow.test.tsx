import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FormLibraryRow } from "@/components/dashboard/FormLibraryRow";
import { renderWithI18n } from "@/lib/test/render-i18n";

vi.mock("@/lib/i18n/client", () => ({
  LocaleLink: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const copyToClipboard = vi.fn(() => Promise.resolve(true));
vi.mock("@/lib/copy-to-clipboard", () => ({
  copyToClipboard: (text: string) => copyToClipboard(text),
}));

const baseForm = {
  id: "form-1",
  title: "IB Economics - Unit 11 - January mock: market failure & government intervention",
  description: "",
  descriptionImagePath: null,
  createdBy: "t1",
  liveTeacherFeedbackEnabled: false,
  questions: [],
};

describe("FormLibraryRow", () => {
  it("shows identity meta and opens the Start popover instead of starting immediately", async () => {
    const onStart = vi.fn();
    const onOpenPopoverChange = vi.fn();

    renderWithI18n(
      <FormLibraryRow
        form={baseForm}
        questionCount={4}
        autogradeCount={3}
        lastRunAt={new Date(Date.now() - 2 * 86_400_000).toISOString()}
        origin="https://truepaper.test"
        durationMinutes={45}
        noTimeLimit={false}
        deliveryMode="live"
        acceptLateSync
        liveTeacherFeedbackEnabled={false}
        starting={false}
        menuItems={[{ type: "button", label: "Copy start link", onClick: vi.fn() }]}
        openPopover={null}
        onOpenPopoverChange={onOpenPopoverChange}
        onDurationChange={vi.fn()}
        onNoTimeLimitChange={vi.fn()}
        onDeliveryModeChange={vi.fn()}
        onAcceptLateSyncChange={vi.fn()}
        onLiveTeacherFeedbackChange={vi.fn()}
        onStart={onStart}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByText(/4 questions/i)).toBeInTheDocument();
    expect(screen.getByText(/3\/4 auto-graded/i)).toBeInTheDocument();
    expect(screen.getByText(/Last run/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Start$/i }));
    expect(onOpenPopoverChange).toHaveBeenCalledWith("start");
    expect(onStart).not.toHaveBeenCalled();
  });

  it("starts from the popover CTA with the chosen summary", async () => {
    const onStart = vi.fn();

    renderWithI18n(
      <FormLibraryRow
        form={baseForm}
        questionCount={4}
        autogradeCount={4}
        lastRunAt={null}
        origin="https://truepaper.test"
        durationMinutes={45}
        noTimeLimit={false}
        deliveryMode="live"
        acceptLateSync
        liveTeacherFeedbackEnabled={false}
        starting={false}
        menuItems={[]}
        openPopover="start"
        onOpenPopoverChange={vi.fn()}
        onDurationChange={vi.fn()}
        onNoTimeLimitChange={vi.fn()}
        onDeliveryModeChange={vi.fn()}
        onAcceptLateSyncChange={vi.fn()}
        onLiveTeacherFeedbackChange={vi.fn()}
        onStart={onStart}
        onEdit={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /Session options/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /Start live session, 45 min/i }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("shows a live URL preview on the Get link tab and copies it from the CTA", async () => {
    const onOpenPopoverChange = vi.fn();

    renderWithI18n(
      <FormLibraryRow
        form={baseForm}
        questionCount={4}
        autogradeCount={4}
        lastRunAt={null}
        origin="https://truepaper.test"
        durationMinutes={45}
        noTimeLimit={false}
        deliveryMode="self_paced"
        acceptLateSync={false}
        liveTeacherFeedbackEnabled
        starting={false}
        menuItems={[]}
        openPopover="start-link"
        onOpenPopoverChange={onOpenPopoverChange}
        onDurationChange={vi.fn()}
        onNoTimeLimitChange={vi.fn()}
        onDeliveryModeChange={vi.fn()}
        onAcceptLateSyncChange={vi.fn()}
        onLiveTeacherFeedbackChange={vi.fn()}
        onStart={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /Teacher start link/i })).toBeInTheDocument();
    });
    // URL preview reflects the current options as individual query params.
    expect(screen.getByText("minutes=45")).toBeInTheDocument();
    expect(screen.getByText("delivery=self_paced")).toBeInTheDocument();
    expect(screen.getByText("lateSync=0")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Copy link/i }));
    expect(copyToClipboard).toHaveBeenCalledWith(
      "https://truepaper.test/en/dashboard/forms/form-1/start?minutes=45&delivery=self_paced&lateSync=0",
    );
    expect(onOpenPopoverChange).toHaveBeenCalledWith(null);
  });
});
