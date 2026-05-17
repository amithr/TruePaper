import type { StudentAnswers } from "@/lib/forms";

/** Whether a server load may replace local exam answer state (first load, no in-progress typing). */
export function shouldApplyServerAnswersOnLoad(
  isFirstLoadForKey: boolean,
  hasLocalEdits: boolean,
): boolean {
  return isFirstLoadForKey && !hasLocalEdits;
}

/**
 * After a server fetch, keep what the student has been typing unless this is the first
 * hydration for the session/device and they have not edited yet.
 */
export function resolveExamAnswersWhenServerLoads(params: {
  isFirstLoadForKey: boolean;
  hasLocalEdits: boolean;
  currentAnswers: StudentAnswers;
  serverAnswers: StudentAnswers;
}): StudentAnswers {
  if (shouldApplyServerAnswersOnLoad(params.isFirstLoadForKey, params.hasLocalEdits)) {
    return params.serverAnswers;
  }
  return params.currentAnswers;
}
