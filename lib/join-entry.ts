import type { ActiveExam } from "@/lib/active-exam";
import { joinUrlRequestsFreshDevice } from "@/lib/anonymous-session";
import { isValidJoinCodeFormat, normalizeJoinCode } from "@/lib/join-code";

export type JoinEntry =
  /** Class link / QR for the exam this browser is already taking: offer to continue. */
  | { kind: "welcome-back"; active: ActiveExam; code: string }
  /** Reload with no URL intent: rejoin silently. */
  | { kind: "auto-restore"; active: ActiveExam }
  /** Class link for a different exam: a new student on this browser. */
  | { kind: "fresh"; code: string | null }
  /** Plain join form (optionally prefilled with a code or a resume code). */
  | { kind: "form"; code: string | null };

/**
 * What to do when the join page opens. The class link carries `new=1`, which used
 * to wipe this browser's device id on every visit — so a student who re-scanned
 * the QR after a crash lost their answers. Now a link for the *same* exam this
 * browser was taking offers "Welcome back" instead; a link for a different exam
 * still starts fresh (shared lab computers).
 */
export function resolveJoinEntry(input: {
  params: URLSearchParams;
  activeExam: ActiveExam | null;
}): JoinEntry {
  const { params, activeExam } = input;
  const raw = params.get("code") ?? params.get("join");
  const normalized = raw ? normalizeJoinCode(raw) : "";
  const code = normalized && isValidJoinCodeFormat(normalized) ? normalized : null;
  const fresh = joinUrlRequestsFreshDevice(params);

  if (params.has("resume")) {
    return fresh ? { kind: "fresh", code } : { kind: "form", code };
  }

  if (code) {
    if (activeExam && normalizeJoinCode(activeExam.joinCode) === code) {
      return { kind: "welcome-back", active: activeExam, code };
    }
    return fresh ? { kind: "fresh", code } : { kind: "form", code };
  }

  if (fresh) {
    return { kind: "fresh", code: null };
  }
  if (activeExam) {
    return { kind: "auto-restore", active: activeExam };
  }
  return { kind: "form", code: null };
}
