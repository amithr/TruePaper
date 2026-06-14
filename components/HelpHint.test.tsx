import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HelpHint } from "@/components/HelpHint";
import { setHintsEnabled } from "@/lib/help-prefs";

describe("HelpHint", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("renders a trigger when hints are enabled (default)", async () => {
    render(<HelpHint id="t1" text="Helpful tip" />);
    expect(await screen.findByLabelText("Helpful tip")).toBeInTheDocument();
  });

  it("shows the tooltip text on focus and hides on Escape", async () => {
    const user = userEvent.setup();
    render(<HelpHint id="t2" text="Delivery mode explains how students answer." />);
    const trigger = await screen.findByLabelText(/Delivery mode/);

    await user.click(trigger);
    expect(
      await screen.findByText(/Delivery mode explains how students answer\./),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
    );
  });

  it("hides the trigger but keeps children when hints are disabled", async () => {
    setHintsEnabled(false);
    render(
      <HelpHint id="t3" text="A hint">
        <span data-testid="wrapped">control</span>
      </HelpHint>,
    );
    expect(await screen.findByTestId("wrapped")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByLabelText("A hint")).not.toBeInTheDocument(),
    );
  });

  it("renders nothing when hints are disabled and there are no children", async () => {
    setHintsEnabled(false);
    const { container } = render(<HelpHint id="t4" text="A hint" />);
    await waitFor(() => expect(container.querySelector(".tp-help-hint")).toBeNull());
  });
});
