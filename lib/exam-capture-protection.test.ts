import { afterEach, describe, expect, it, vi } from "vitest";

import {
  formatExamWatermarkLabel,
  installExamCaptureGuards,
  type CaptureViolationKind,
} from "@/lib/exam-capture-protection";

describe("formatExamWatermarkLabel", () => {
  it("includes display name and a short session fragment", () => {
    expect(
      formatExamWatermarkLabel("Alex", "a1b2c3d4-e5f6-4789-a012-3456789abcde"),
    ).toBe("Alex · A1B2C3D4");
  });

  it("falls back when display name is blank", () => {
    expect(formatExamWatermarkLabel("  ", "abcd1234-0000-4000-8000-000000000000")).toBe(
      "Student · ABCD1234",
    );
  });
});

describe("installExamCaptureGuards", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks getDisplayMedia and reports a violation", async () => {
    const violations: CaptureViolationKind[] = [];
    const getDisplayMedia = vi.fn(async () => new MediaStream());
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getDisplayMedia },
    });

    const restore = installExamCaptureGuards({
      onViolation: (kind) => violations.push(kind),
    });

    await expect(navigator.mediaDevices.getDisplayMedia()).rejects.toMatchObject({
      name: "NotAllowedError",
    });
    expect(violations).toEqual(["getDisplayMedia"]);
    expect(getDisplayMedia).not.toHaveBeenCalled();

    restore();
  });

  it("does not throw when getDisplayMedia is missing (mobile Safari)", () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {},
    });

    expect(() =>
      installExamCaptureGuards({
        onViolation: () => undefined,
      })(),
    ).not.toThrow();
  });

  it("detects PrintScreen and macOS screenshot shortcuts", () => {
    const violations: CaptureViolationKind[] = [];
    const restore = installExamCaptureGuards({
      onViolation: (kind) => violations.push(kind),
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "PrintScreen", bubbles: true }));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "4", metaKey: true, shiftKey: true, bubbles: true }),
    );

    expect(violations).toEqual(["printScreen", "screenshotShortcut"]);

    restore();
  });
});
