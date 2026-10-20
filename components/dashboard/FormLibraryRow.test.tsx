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

const sharedProps = {
  form: baseForm,
  questionCount: 4,
  autogradeCount: 3,
  lastRunAt: null as string | null,
  origin: "https://truepaper.test",
  durationMinutes: 45,
  noTimeLimit: false,
  deliveryMode: "live" as const,
  acceptLateSync: true,
  liveTeacherFeedbackEnabled: false,
  starting: false,
  menuItems: [] as [],
  onDurationChange: vi.fn(),
  onNoTimeLimitChange: vi.fn(),
  onDeliveryModeChange: vi.fn(),
  onAcceptLateSyncChange: vi.fn(),
  onLiveTeacherFeedbackChange: vi.fn(),
  onEdit: vi.fn(),
};

describe("FormLibraryRow", () => {
  it("shows identity meta and opens the Start popover instead of starting immediately", async () => {
    const onStart = vi.fn();
    const onOpenPopoverChange = vi.fn();

    renderWithI18n(
      <FormLibraryRow
        {...sharedProps}
        lastRunAt={new Date(Date.now() - 2 * 86_400_000).toISOString()}
        autogradeCount={3}
        menuItems={[{ type: "button", label: "Copy start link…", onClick: vi.fn() }]}
        openPopover={null}
        onOpenPopoverChange={onOpenPopoverChange}
        onStart={onStart}
      />,
    );

    expect(screen.getByText(/4 questions/i)).toBeInTheDocument();
    expect(screen.getByText(/3\/4 auto-graded/i)).toBeInTheDocument();
    expect(screen.getByText(/Last run/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Start$/i }));
    expect(onOpenPopoverChange).toHaveBeenCalledWith("start");
    expect(onStart).not.toHaveBeenCalled();
  });

  it("opens collapsed on a 'same as last time' summary and starts in one click", async () => {
    window.localStorage.clear();
    const onStart = vi.fn();

    renderWithI18n(
      <FormLibraryRow
        {...sharedProps}
        openPopover="start"
        onOpenPopoverChange={vi.fn()}
        onStart={onStart}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /Start session/i })).toBeInTheDocument();
    });
    expect(screen.getByTestId("start-summary")).toHaveTextContent("Live session, 45 min");
    expect(screen.getByText("Late sync on")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^Start session$/i }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("expands settings on demand and remembers that choice", async () => {
    window.localStorage.clear();
    const { unmount } = renderWithI18n(
      <FormLibraryRow {...sharedProps} openPopover="start" onOpenPopoverChange={vi.fn()} onStart={vi.fn()} />,
    );
    const toggle = await screen.findByRole("button", { name: /Change settings/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: /Hide settings/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("radiogroup", { name: /Duration/i })).toBeInTheDocument();
    unmount();

    renderWithI18n(
      <FormLibraryRow {...sharedProps} openPopover="start" onOpenPopoverChange={vi.fn()} onStart={vi.fn()} />,
    );
    expect(await screen.findByRole("radiogroup", { name: /Duration/i })).toBeInTheDocument();
    window.localStorage.clear();
  });

  it("uses duration presets, with Custom for other values", async () => {
    window.localStorage.setItem("truepaper_start_settings_expanded", "1");
    const onDurationChange = vi.fn();
    const onNoTimeLimitChange = vi.fn();
    const { rerender } = renderWithI18n(
      <FormLibraryRow
        {...sharedProps}
        openPopover="start"
        onOpenPopoverChange={vi.fn()}
        onStart={vi.fn()}
        onDurationChange={onDurationChange}
        onNoTimeLimitChange={onNoTimeLimitChange}
      />,
    );

    expect(await screen.findByRole("radio", { name: "45 min" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("spinbutton")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "60 min" }));
    expect(onNoTimeLimitChange).toHaveBeenLastCalledWith(false);
    expect(onDurationChange).toHaveBeenLastCalledWith(60);
    fireEvent.click(screen.getByRole("radio", { name: /No limit/i }));
    expect(onNoTimeLimitChange).toHaveBeenLastCalledWith(true);

    rerender(
      <FormLibraryRow
        {...sharedProps}
        durationMinutes={50}
        openPopover="start"
        onOpenPopoverChange={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    expect(screen.getByRole("radio", { name: "Custom" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("spinbutton", { name: /Session minutes/i })).toHaveValue(50);
    window.localStorage.clear();
  });

  it("only offers late sync for Live, where it has an effect", async () => {
    window.localStorage.setItem("truepaper_start_settings_expanded", "1");
    const { rerender } = renderWithI18n(
      <FormLibraryRow {...sharedProps} openPopover="start" onOpenPopoverChange={vi.fn()} onStart={vi.fn()} />,
    );
    expect(await screen.findByLabelText(/saved offline after time's up/i)).toBeInTheDocument();

    rerender(
      <FormLibraryRow
        {...sharedProps}
        deliveryMode="self_paced"
        openPopover="start"
        onOpenPopoverChange={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(/saved offline after time's up/i)).toBeNull();
    expect(screen.queryByText(/Late sync/i)).toBeNull();
    window.localStorage.clear();
  });

  it("opens with settings expanded from the ⋯ menu and copies the start link", async () => {
    window.localStorage.clear();
    const onOpenPopoverChange = vi.fn();

    renderWithI18n(
      <FormLibraryRow
        {...sharedProps}
        deliveryMode="self_paced"
        acceptLateSync={false}
        liveTeacherFeedbackEnabled
        openPopover="start-link"
        onOpenPopoverChange={onOpenPopoverChange}
        onStart={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("radiogroup", { name: /Duration/i })).toBeInTheDocument();
    });
    expect(screen.getByText("Live feedback on")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Copy start link/i }));
    expect(copyToClipboard).toHaveBeenCalledWith(
      "https://truepaper.test/en/dashboard/forms/form-1/start?minutes=45&delivery=self_paced&lateSync=0",
    );
    expect(onOpenPopoverChange).toHaveBeenCalledWith(null);
  });
});
