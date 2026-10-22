import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DashboardLazySection } from "@/components/dashboard/DashboardLazySection";

describe("DashboardLazySection", () => {
  it("mounts children immediately when eager (so the first-login tour finds its anchors)", () => {
    render(
      <DashboardLazySection id="form-library" eager placeholder={<p>Loading…</p>}>
        <button type="button" data-tour="new-form">
          New form
        </button>
      </DashboardLazySection>,
    );
    expect(screen.getByRole("button", { name: /new form/i })).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).toBeNull();
  });
});
