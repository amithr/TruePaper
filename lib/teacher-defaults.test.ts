import { describe, expect, it } from "vitest";

import {
  parseTeacherDefaults,
  RECOMMENDED_TEACHER_DEFAULTS,
  teacherDefaultsEqual,
  teacherDefaultsFromRow,
  teacherDefaultsToRow,
} from "@/lib/teacher-defaults";

describe("teacherDefaultsFromRow", () => {
  it("falls back to the recommended defaults without a row", () => {
    expect(teacherDefaultsFromRow(null)).toEqual(RECOMMENDED_TEACHER_DEFAULTS);
  });

  it("normalises a stored row (null duration = no limit, clamped minutes)", () => {
    expect(
      teacherDefaultsFromRow({ duration_minutes: null, delivery_mode: "hybrid", accept_late_sync: false, live_feedback: false }),
    ).toEqual({ durationMinutes: null, deliveryMode: "hybrid", acceptLateSync: false, liveFeedback: false });
    expect(teacherDefaultsFromRow({ duration_minutes: 2, delivery_mode: "bogus" }).durationMinutes).toBe(5);
    expect(teacherDefaultsFromRow({ duration_minutes: 2, delivery_mode: "bogus" }).deliveryMode).toBe("live");
  });
});

describe("parseTeacherDefaults", () => {
  it("accepts a valid payload and rejects bad ones", () => {
    const ok = { durationMinutes: 60, deliveryMode: "self_paced", acceptLateSync: true, liveFeedback: false };
    expect(parseTeacherDefaults(ok)).toEqual(ok);
    expect(parseTeacherDefaults({ ...ok, durationMinutes: null })).toMatchObject({ durationMinutes: null });
    expect(parseTeacherDefaults({ ...ok, durationMinutes: 3 })).toBeNull();
    expect(parseTeacherDefaults({ ...ok, durationMinutes: "45" })).toBeNull();
    expect(parseTeacherDefaults({ ...ok, deliveryMode: "async" })).toBeNull();
    expect(parseTeacherDefaults({ ...ok, liveFeedback: "yes" })).toBeNull();
    expect(parseTeacherDefaults(null)).toBeNull();
  });

  it("round-trips through the row shape", () => {
    const d = { durationMinutes: null, deliveryMode: "hybrid" as const, acceptLateSync: false, liveFeedback: true };
    expect(teacherDefaultsFromRow(teacherDefaultsToRow(d))).toEqual(d);
    expect(teacherDefaultsEqual(d, { ...d })).toBe(true);
    expect(teacherDefaultsEqual(d, { ...d, liveFeedback: false })).toBe(false);
  });
});
