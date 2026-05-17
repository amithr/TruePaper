import { describe, expect, it } from "vitest";

import { teacherWatchChannelName } from "@/lib/broadcast-teacher-watch";
import { studentExamChannelName } from "@/lib/student-exam-channel";

const sessionId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const deviceId = "12345678-1234-4123-8123-123456789abc";

describe("realtime channel names", () => {
  it("uses a stable lowercase device id for teacher watch broadcasts", () => {
    expect(teacherWatchChannelName(sessionId, deviceId.toUpperCase())).toBe(
      `teacher-watch:${sessionId}:${deviceId.toLowerCase()}`,
    );
  });

  it("uses the same student exam channel name on teacher push and student subscribe", () => {
    const fromTeacher = studentExamChannelName(sessionId, deviceId);
    const fromStudent = studentExamChannelName(sessionId, deviceId.toUpperCase());
    expect(fromTeacher).toBe(fromStudent);
    expect(fromTeacher).toBe(`student-exam:${sessionId}:${deviceId.toLowerCase()}`);
  });
});
