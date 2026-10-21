import { describe, expect, it } from "vitest";

import { isValidJoinCodeFormat } from "@/lib/join-code";
import {
  DEMO_CHAPTER_STARTS,
  DEMO_JOIN_CODE,
  DEMO_LOOP_MS,
  demoFrame,
} from "@/lib/landing-demo";

describe("landing demo timeline", () => {
  it("uses a join code the real app would accept", () => {
    expect(isValidJoinCodeFormat(DEMO_JOIN_CODE)).toBe(true);
  });

  it("reveals the code, then joins Ava into the exam", () => {
    expect(demoFrame(0, "wifi").codeChars.filter((c) => c.shown)).toHaveLength(0);
    expect(demoFrame(1700, "wifi").codeChars.every((c) => c.shown)).toBe(true);
    expect(demoFrame(2300, "wifi")).toMatchObject({ screen: "join", nameFocused: true });
    expect(demoFrame(3500, "wifi")).toMatchObject({ screen: "exam", avaJoined: true, rosterCount: 3 });
  });

  it("types, then shows Saving… and Saved with the teacher mirror lagging", () => {
    const typing = demoFrame(6000, "wifi");
    expect(typing.sync).toBe("saving");
    expect(typing.avaPill).toBe("typing");
    expect(typing.mirrorText.length).toBeLessThan(typing.answerText.length);
    expect(demoFrame(8500, "wifi")).toMatchObject({ sync: "saved", questionSaved: true, avaPill: "working" });
  });

  it("Wi-Fi outage: reconnect line, queue, offline roster, frozen mirror", () => {
    const f = demoFrame(12_000, "wifi");
    expect(f).toMatchObject({ offline: true, sync: "reconnect", avaPill: "offline", needsCheck: true, mirrorStale: true });
    expect(f.queued).toBeGreaterThan(0);
    expect(f.mirrorText).toBe("Plants trap sunlight");
  });

  it("recovers: queue drains and the mirror catches up", () => {
    expect(demoFrame(15_000, "wifi")).toMatchObject({ sync: "syncing", offline: false });
    const after = demoFrame(16_000, "wifi");
    expect(after).toMatchObject({ sync: "saved", queued: 0, needsCheck: false });
    expect(after.mirrorText).toBe(after.answerText);
  });

  it("power variant: battery dies, then answers are restored", () => {
    expect(demoFrame(8000, "power").battery).toBe("low");
    expect(demoFrame(9500, "power")).toMatchObject({ screen: "dark", battery: "empty" });
    expect(demoFrame(11_000, "power")).toMatchObject({ screen: "exam", restoredToast: true });
  });

  it("no-outage variant never goes offline", () => {
    for (let t = 0; t < DEMO_LOOP_MS; t += 250) {
      expect(demoFrame(t, "none").offline).toBe(false);
    }
  });

  it("feedback, hand-in and submit, then loops", () => {
    expect(demoFrame(18_000, "wifi").feedbackVisible).toBe(true);
    expect(demoFrame(21_000, "wifi").handInPressed).toBe(true);
    expect(demoFrame(22_000, "wifi")).toMatchObject({ screen: "done", avaPill: "submitted", avaStatus: "handedIn" });
    expect(demoFrame(DEMO_LOOP_MS + 100, "wifi").screen).toBe("join");
  });

  it("chapter index follows the chapter starts", () => {
    DEMO_CHAPTER_STARTS.forEach((start, i) => {
      expect(demoFrame(start, "wifi").activeChapter).toBe(i);
    });
  });
});
