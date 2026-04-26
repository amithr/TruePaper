export type LivePublicBoardPayload = {
  joinCode: string;
  formTitle: string;
  opensAt: string;
  closesAt: string;
  durationMinutes: number;
  /** Counts keyed by `question_type` from the database (e.g. multipleChoice, text). */
  questionCounts: Record<string, number>;
  assignedCount: number;
  inProgressCount: number;
};

export function parseLivePublicBoardRpc(data: unknown): LivePublicBoardPayload | null {
  if (data === null || data === undefined || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  const o = data as Record<string, unknown>;
  if (o.ok !== true) {
    return null;
  }
  const joinCode = typeof o.joinCode === "string" ? o.joinCode : "";
  const formTitle = typeof o.formTitle === "string" ? o.formTitle : "Form";
  const opensAt = typeof o.opensAt === "string" ? o.opensAt : "";
  const closesAt = typeof o.closesAt === "string" ? o.closesAt : "";
  const durationMinutes =
    typeof o.durationMinutes === "number" && Number.isFinite(o.durationMinutes)
      ? Math.max(1, Math.floor(o.durationMinutes))
      : 1;
  const qcRaw = o.questionCounts;
  const questionCounts: Record<string, number> = {};
  if (qcRaw && typeof qcRaw === "object" && !Array.isArray(qcRaw)) {
    for (const [k, v] of Object.entries(qcRaw as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) {
        questionCounts[k] = v;
      }
    }
  }
  const assignedCount =
    typeof o.assignedCount === "number" && Number.isFinite(o.assignedCount)
      ? Math.max(0, Math.floor(o.assignedCount))
      : 0;
  const inProgressCount =
    typeof o.inProgressCount === "number" && Number.isFinite(o.inProgressCount)
      ? Math.max(0, Math.floor(o.inProgressCount))
      : 0;
  if (!joinCode || !opensAt || !closesAt) {
    return null;
  }
  return {
    joinCode,
    formTitle,
    opensAt,
    closesAt,
    durationMinutes,
    questionCounts,
    assignedCount,
    inProgressCount,
  };
}
