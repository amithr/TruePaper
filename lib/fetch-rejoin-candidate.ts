export type RejoinCandidate = {
  found: boolean;
  ambiguous: boolean;
  answeredCount: number;
  questionTotal: number;
  lastActiveAt: string | null;
  suspended: boolean;
  pendingRequest: boolean;
};

/**
 * Is there an unfinished attempt with this name on another device? Returns `null`
 * on any failure (network, old server) so joining never blocks on this check.
 */
export async function fetchRejoinCandidate(
  liveSessionId: string,
  displayName: string,
  deviceId: string,
): Promise<RejoinCandidate | null> {
  try {
    const params = new URLSearchParams({ name: displayName, deviceId });
    const res = await fetch(
      `/api/public/live-sessions/${liveSessionId}/rejoin-candidate?${params.toString()}`,
      { cache: "no-store" },
    );
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as Partial<RejoinCandidate>;
    return {
      found: data.found === true,
      ambiguous: data.ambiguous === true,
      answeredCount: Math.max(0, Number(data.answeredCount) || 0),
      questionTotal: Math.max(0, Number(data.questionTotal) || 0),
      lastActiveAt: typeof data.lastActiveAt === "string" ? data.lastActiveAt : null,
      suspended: data.suspended === true,
      pendingRequest: data.pendingRequest === true,
    };
  } catch {
    return null;
  }
}
