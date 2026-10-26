import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useInitialLoadRetry } from "@/lib/use-initial-load-retry";

function Probe({ loaded, retry }: { loaded: boolean; retry: () => void }) {
  const { slow } = useInitialLoadRetry(loaded, retry);
  return <span data-testid="slow">{slow ? "yes" : "no"}</span>;
}
const slowSeen = () => screen.getByTestId("slow").textContent === "yes";

describe("useInitialLoadRetry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps retrying a failed first load and admits it's slow after a few tries", () => {
    const retry = vi.fn();
    render(<Probe loaded={false} retry={retry} />);
    act(() => vi.advanceTimersByTime(2500));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(slowSeen()).toBe(false);
    act(() => vi.advanceTimersByTime(5000));
    expect(retry).toHaveBeenCalledTimes(3);
    expect(slowSeen()).toBe(true);
  });

  it("stops once the page has data", () => {
    const retry = vi.fn();
    const view = render(<Probe loaded={false} retry={retry} />);
    view.rerender(<Probe loaded retry={retry} />);
    act(() => vi.advanceTimersByTime(10_000));
    expect(retry).not.toHaveBeenCalled();
    expect(slowSeen()).toBe(false);
  });
});
