import { beforeEach, describe, expect, it, vi } from "vitest";

import { cacheExamSession, estimatePayloadBytes, loadCachedExamSession } from "@/lib/offline/session-cache";
import type { Form } from "@/lib/forms";
import { TEST_DEVICE_ID, TEST_LIVE_SESSION_ID } from "@/lib/test/fixtures";

const cacheStore = new Map<string, unknown>();

vi.mock("@/lib/offline/idb", () => ({
  idbPut: vi.fn(async (_store: string, value: { key: string }) => {
    cacheStore.set(value.key, value);
  }),
  idbGet: vi.fn(async (_store: string, key: string) => {
    return (cacheStore.get(key) as never) ?? null;
  }),
  sessionDeviceKey: (liveSessionId: string, deviceId: string) =>
    `${liveSessionId}::${deviceId.toLowerCase()}`,
}));

const miniForm: Form = {
  id: "form-1",
  title: "Quiz",
  description: "",
  descriptionImagePath: null,
  createdBy: null,
  liveTeacherFeedbackEnabled: false,
  questions: [
    {
      id: "q1",
      prompt: "Name?",
      promptImagePath: null,
      type: "text",
      options: [],
      correctAnswer: null,
      points: 1,
      displayOrder: 0,
      responseConfig: {},
    },
  ],
};

describe("session-cache", () => {
  beforeEach(() => {
    cacheStore.clear();
  });

  it("estimates payload bytes from JSON blob size", () => {
    expect(estimatePayloadBytes(miniForm)).toBeGreaterThan(0);
  });

  it("round-trips cached exam session through IndexedDB", async () => {
    const result = await cacheExamSession({
      liveSessionId: TEST_LIVE_SESSION_ID,
      deviceId: TEST_DEVICE_ID,
      joinCode: "ABCD12",
      displayName: "Student",
      form: miniForm,
      deliveryMode: "hybrid",
    });
    expect(result.ok).toBe(true);
    const loaded = await loadCachedExamSession(TEST_LIVE_SESSION_ID, TEST_DEVICE_ID);
    expect(loaded?.form.title).toBe("Quiz");
    expect(loaded?.deliveryMode).toBe("hybrid");
    expect(loaded?.joinCode).toBe("ABCD12");
  });
});
