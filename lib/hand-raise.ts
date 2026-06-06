export type HandRaiseState = {
  handRaiseQuestionId: string | null;
  handRaisedAt: string | null;
};

export function parseHandRaiseState(raw: unknown): HandRaiseState {
  if (!raw || typeof raw !== "object") {
    return { handRaiseQuestionId: null, handRaisedAt: null };
  }
  const row = raw as Record<string, unknown>;
  const handRaiseQuestionId =
    typeof row.handRaiseQuestionId === "string" && row.handRaiseQuestionId.trim()
      ? row.handRaiseQuestionId.trim()
      : null;
  const handRaisedAt =
    typeof row.handRaisedAt === "string" && row.handRaisedAt.trim() ? row.handRaisedAt.trim() : null;
  return { handRaiseQuestionId, handRaisedAt };
}

export function isHandRaisedForQuestion(state: HandRaiseState, questionId: string): boolean {
  return (
    state.handRaiseQuestionId !== null &&
    state.handRaiseQuestionId === questionId &&
    state.handRaisedAt !== null
  );
}
