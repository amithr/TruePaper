import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePollingRefresh } from "@/lib/use-polling-refresh";

function Probe({ onRefresh, refreshOnReturn }: { onRefresh: () => void; refreshOnReturn: boolean }) {
  usePollingRefresh({ enabled: true, intervalMs: 1000, immediate: true, refreshOnReturn, onRefresh });
  return null;
}

describe("usePollingRefresh refreshOnReturn", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes immediately, on the interval, and when the teacher comes back to the tab", () => {
    const onRefresh = vi.fn();
    render(<Probe onRefresh={onRefresh} refreshOnReturn />);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onRefresh).toHaveBeenCalledTimes(2);
    act(() => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });
    expect(onRefresh).toHaveBeenCalledTimes(4);
  });

  it("does not listen for return events unless asked", () => {
    const onRefresh = vi.fn();
    render(<Probe onRefresh={onRefresh} refreshOnReturn={false} />);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
