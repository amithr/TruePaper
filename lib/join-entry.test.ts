import { describe, expect, it } from "vitest";

import type { ActiveExam } from "@/lib/active-exam";
import { resolveJoinEntry } from "@/lib/join-entry";
import { TEST_DEVICE_ID, TEST_LIVE_SESSION_ID } from "@/lib/test/fixtures";

const active: ActiveExam = {
  liveSessionId: TEST_LIVE_SESSION_ID,
  joinCode: "ABCDEF",
  displayName: "Jordan Lee",
  deviceId: TEST_DEVICE_ID,
  opensAt: "2026-01-01T00:00:00.000Z",
  closesAt: "2099-01-01T00:00:00.000Z",
  deliveryMode: "live",
  savedAt: 1,
};

const params = (qs: string) => new URLSearchParams(qs);

describe("resolveJoinEntry", () => {
  it("offers welcome-back for the class link of the exam this browser is taking", () => {
    expect(resolveJoinEntry({ params: params("code=ABCDEF&new=1&student=x"), activeExam: active })).toEqual({
      kind: "welcome-back",
      active,
      code: "ABCDEF",
    });
    expect(resolveJoinEntry({ params: params("code=abcdef"), activeExam: active })).toMatchObject({
      kind: "welcome-back",
    });
    expect(resolveJoinEntry({ params: params("join=ABCDEF&new=1"), activeExam: active })).toMatchObject({
      kind: "welcome-back",
    });
  });

  it("starts fresh for a class link to a different exam", () => {
    expect(resolveJoinEntry({ params: params("code=WXYZ23&new=1"), activeExam: active })).toEqual({
      kind: "fresh",
      code: "WXYZ23",
    });
    expect(resolveJoinEntry({ params: params("code=WXYZ23"), activeExam: active })).toEqual({
      kind: "form",
      code: "WXYZ23",
    });
  });

  it("never shows welcome-back for a resume-code link", () => {
    expect(resolveJoinEntry({ params: params("resume=ABCDEFGH&code=ABCDEF"), activeExam: active })).toEqual({
      kind: "form",
      code: "ABCDEF",
    });
  });

  it("auto-restores a reload with no URL intent", () => {
    expect(resolveJoinEntry({ params: params(""), activeExam: active })).toEqual({
      kind: "auto-restore",
      active,
    });
    expect(resolveJoinEntry({ params: params(""), activeExam: null })).toEqual({ kind: "form", code: null });
    expect(resolveJoinEntry({ params: params("new=1"), activeExam: active })).toEqual({
      kind: "fresh",
      code: null,
    });
  });

  it("treats an invalid code as no code", () => {
    expect(resolveJoinEntry({ params: params("code=!!&new=1"), activeExam: active })).toEqual({
      kind: "fresh",
      code: null,
    });
  });
});
