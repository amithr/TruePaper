import { isValidJoinCodeFormat, normalizeJoinCode } from "@/lib/join-code";

/** Build a join URL that starts a new anonymous student device when opened. */
export function buildStudentJoinUrl(origin: string, joinCode: string, studentSlotId?: string): string {
  const code = normalizeJoinCode(joinCode);
  if (!origin || !isValidJoinCodeFormat(code)) {
    return "";
  }
  const u = new URL("/join", origin);
  u.searchParams.set("code", code);
  u.searchParams.set("new", "1");
  u.searchParams.set("student", studentSlotId ?? crypto.randomUUID());
  return u.toString();
}
