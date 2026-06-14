import { describe, expect, it } from "vitest";

import { isRetryableNetworkError } from "@/lib/network-error";

describe("isRetryableNetworkError", () => {
  it("treats abort and fetch failures as retryable", () => {
    const abort = new Error("The operation was aborted");
    abort.name = "AbortError";
    expect(isRetryableNetworkError(abort)).toBe(true);
    expect(isRetryableNetworkError(new Error("Failed to fetch"))).toBe(true);
    expect(isRetryableNetworkError(new Error("503 Service Unavailable"))).toBe(true);
  });

  it("treats validation errors as non-retryable", () => {
    expect(isRetryableNetworkError(new Error("Invalid display name"))).toBe(false);
  });
});
