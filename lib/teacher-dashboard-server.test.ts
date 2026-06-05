import { describe, expect, it } from "vitest";

import { resolveParticipantActivityForTest } from "@/lib/teacher-dashboard-server";

describe("resolveParticipantActivityForTest", () => {
  it("prefers live_session_presence timestamps over stale form_responses columns", () => {
    const presenceByKey = new Map([
      [
        "session-1:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        {
          lastActivityAt: "2026-06-05T12:00:00.000Z",
          lastTypingAt: "2026-06-05T12:00:01.000Z",
        },
      ],
    ]);

    const activity = resolveParticipantActivityForTest(
      "session-1",
      {
        anonymous_session_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        last_activity_at: null,
        last_typing_at: null,
      },
      presenceByKey,
    );

    expect(activity.lastActivityAt).toBe("2026-06-05T12:00:00.000Z");
    expect(activity.lastTypingAt).toBe("2026-06-05T12:00:01.000Z");
  });

  it("falls back to form_responses columns when presence is missing", () => {
    const activity = resolveParticipantActivityForTest(
      "session-1",
      {
        anonymous_session_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        last_activity_at: "2026-06-05T11:00:00.000Z",
        last_typing_at: null,
      },
      new Map(),
    );

    expect(activity.lastActivityAt).toBe("2026-06-05T11:00:00.000Z");
    expect(activity.lastTypingAt).toBeNull();
  });
});
