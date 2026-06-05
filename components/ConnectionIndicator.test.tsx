import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConnectionIndicator } from "@/components/ConnectionIndicator";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import type { Dictionary } from "@/lib/i18n/types";
import en from "@/messages/en.json";

function renderIndicator(state: Parameters<typeof ConnectionIndicator>[0]["state"], pendingCount = 0) {
  return render(
    <I18nProvider locale="en" dict={en as Dictionary}>
      <ConnectionIndicator state={state} pendingCount={pendingCount} />
    </I18nProvider>,
  );
}

describe("ConnectionIndicator", () => {
  it("shows offline copy", () => {
    renderIndicator("offline");
    expect(screen.getByTestId("connection-indicator")).toHaveAttribute("data-state", "offline");
    expect(screen.getByText(/Saved locally/i)).toBeInTheDocument();
  });

  it("shows syncing copy", () => {
    renderIndicator("syncing");
    expect(screen.getByText(/Syncing/i)).toBeInTheDocument();
  });

  it("shows pending count when queue has items", () => {
    renderIndicator("synced", 3);
    expect(screen.getByText(/3 change/)).toBeInTheDocument();
  });
});
