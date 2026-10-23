import { beforeEach, describe, expect, it, vi } from "vitest";

import { putStudentAnswersSync } from "@/lib/offline/sync-transport";
import { RequestJsonError } from "@/lib/request-json";
import {
  TEST_DEVICE_ID,
  TEST_DISPLAY_NAME,
  TEST_LIVE_SESSION_ID,
  TEST_SUBMISSION_ID,
} from "@/lib/test/fixtures";

const requestJson = vi.fn();

vi.mock("@/lib/request-json", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/request-json")>()),
  requestJson: (...args: unknown[]) => requestJson(...args),
}));

describe("putStudentAnswersSync", () => {
  beforeEach(() => {
    requestJson.mockReset();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("sends submissionId for idempotent sync", async () => {
    requestJson.mockResolvedValue({ ok: true, deduped: false });
    const result = await putStudentAnswersSync({
      liveSessionId: TEST_LIVE_SESSION_ID,
      deviceId: TEST_DEVICE_ID,
      displayName: TEST_DISPLAY_NAME,
      answers: { q1: "answer" },
      submissionId: TEST_SUBMISSION_ID,
    });
    expect(result.ok).toBe(true);
    expect(requestJson).toHaveBeenCalledWith(
      `/api/public/live-sessions/${TEST_LIVE_SESSION_ID}/responses`,
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining(TEST_SUBMISSION_ID),
      }),
    );
  });

  it("marks network errors as retryable when offline", async () => {
    requestJson.mockRejectedValue(new Error("Failed to fetch"));
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const result = await putStudentAnswersSync({
      liveSessionId: TEST_LIVE_SESSION_ID,
      deviceId: TEST_DEVICE_ID,
      displayName: TEST_DISPLAY_NAME,
      answers: { q1: "answer" },
      submissionId: TEST_SUBMISSION_ID,
    });
    expect(result).toEqual({ ok: false, retryable: true, message: "Failed to fetch" });
  });

  const input = {
    liveSessionId: TEST_LIVE_SESSION_ID,
    deviceId: TEST_DEVICE_ID,
    displayName: TEST_DISPLAY_NAME,
    answers: { q1: "answer" },
    submissionId: TEST_SUBMISSION_ID,
  };

  it("keeps saves rejected while the student is suspended (423) so they retry", async () => {
    requestJson.mockRejectedValue(
      new RequestJsonError("exam suspended until your teacher allows you to continue", 423),
    );
    const result = await putStudentAnswersSync(input);
    expect(result).toMatchObject({ ok: false, retryable: true });
  });

  it("retries server errors and rate limits", async () => {
    requestJson.mockRejectedValueOnce(new RequestJsonError("boom", 500));
    expect(await putStudentAnswersSync(input)).toMatchObject({ retryable: true });
    requestJson.mockRejectedValueOnce(new RequestJsonError("slow down", 429));
    expect(await putStudentAnswersSync(input)).toMatchObject({ retryable: true });
  });

  it("drops saves once the attempt moved to another device (410)", async () => {
    requestJson.mockRejectedValue(new RequestJsonError("This exam continued on another device.", 410));
    expect(await putStudentAnswersSync(input)).toMatchObject({ ok: false, retryable: false });
  });

  it("treats other client errors as final", async () => {
    requestJson.mockRejectedValue(new RequestJsonError("A valid deviceId is required.", 400));
    expect(await putStudentAnswersSync(input)).toMatchObject({ ok: false, retryable: false });
  });
});
