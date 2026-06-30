import { describe, expect, it } from "vitest";

import { mergeFeedbackForTeacher, type ServerFeedbackItem } from "@/lib/feedback-items";
import type { FeedbackQueueItem } from "@/lib/offline/types";
import { TEST_DEVICE_ID, TEST_LIVE_SESSION_ID } from "@/lib/test/fixtures";

function localItem(id: string, createdAt: number, body: string): FeedbackQueueItem {
  return {
    id,
    liveSessionId: TEST_LIVE_SESSION_ID,
    studentDeviceId: TEST_DEVICE_ID.toLowerCase(),
    responseId: null,
    questionId: null,
    anchor: null,
    authorId: "",
    authorName: "",
    type: "text",
    body,
    responseVersionTag: null,
    createdAt,
    status: "queued",
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
  };
}

function serverItem(id: string, createdAtIso: string, overrides: Partial<ServerFeedbackItem> = {}): ServerFeedbackItem {
  return {
    id,
    questionId: null,
    authorId: "t1",
    authorName: "Ms. Smith",
    type: "text",
    body: "server body",
    createdAt: createdAtIso,
    syncedAt: createdAtIso,
    deliveredAt: null,
    isOwn: true,
    ...overrides,
  };
}

describe("mergeFeedbackForTeacher", () => {
  it("orders by authoritative createdAt across local and server", () => {
    const local = [localItem("a", 3000, "local late")];
    const server = [
      serverItem("b", new Date(1000).toISOString()),
      serverItem("c", new Date(2000).toISOString()),
    ];
    const merged = mergeFeedbackForTeacher(local, server);
    expect(merged.map((m) => m.id)).toEqual(["b", "c", "a"]);
  });

  it("local row wins while an id is still pending (no duplicate)", () => {
    const local = [localItem("dup", 1000, "still queued")];
    const server = [serverItem("dup", new Date(1000).toISOString(), { body: "synced copy" })];
    const merged = mergeFeedbackForTeacher(local, server);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.isLocal).toBe(true);
    expect(merged[0]?.body).toBe("still queued");
  });

  it("maps delivery status from the server row", () => {
    const merged = mergeFeedbackForTeacher(
      [],
      [
        serverItem("s1", new Date(1000).toISOString()),
        serverItem("s2", new Date(2000).toISOString(), { deliveredAt: new Date(3000).toISOString() }),
      ],
    );
    expect(merged.find((m) => m.id === "s1")?.status).toBe("synced");
    expect(merged.find((m) => m.id === "s2")?.status).toBe("delivered");
  });
});
