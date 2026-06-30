/**
 * Deterministic fingerprint of everything the teacher overview payload depends on,
 * used for conditional GET (ETag / 304). When two consecutive polls produce the
 * same fingerprint the server can skip parsing answers + building the payload and
 * the client can skip re-rendering the roster.
 *
 * Answer *content* is captured indirectly via each row's `updatedAt` (autosave
 * bumps it), so we never have to hash large answer blobs. Participant status
 * (typing/idle) is time-dependent, so a coarse time bucket is folded in to bound
 * how stale a no-DB-change status can get — see OVERVIEW_STATUS_BUCKET_MS.
 */

/** Status (typing/idle) may lag real time by at most this long during no-change polls. */
export const OVERVIEW_STATUS_BUCKET_MS = 10_000;

export type OverviewFingerprintRow = {
  anonymousSessionId: string | null;
  displayName: string | null;
  updatedAt: string | null;
  suspendedAt: string | null;
  finishedAt: string | null;
  gradedAt: string | null;
};

export type OverviewFingerprintPresence = {
  syncState: string;
  pendingSyncCount: number;
  lastActivityAt: string | null;
  lastTypingAt: string | null;
  lastSeenAt: string | null;
  handRaiseQuestionId: string | null;
  handRaisedAt: string | null;
};

export type OverviewFingerprintInput = {
  windowOpen: boolean;
  questionsSig: string;
  timeBucket: number;
  rows: OverviewFingerprintRow[];
  presenceByDevice: Map<string, OverviewFingerprintPresence>;
};

function field(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

/**
 * Returns a canonical, order-independent string. The route hashes this into an
 * ETag; keeping it a plain string (no crypto) makes it trivially unit-testable.
 */
export function overviewFingerprint(input: OverviewFingerprintInput): string {
  const parts: string[] = [
    `w:${input.windowOpen ? 1 : 0}`,
    `q:${input.questionsSig}`,
    `t:${input.timeBucket}`,
  ];

  const deviceKeys = input.rows
    .map((r) => r.anonymousSessionId?.toLowerCase() ?? "")
    .filter((k) => k.length > 0)
    .sort();

  const rowByKey = new Map<string, OverviewFingerprintRow>();
  for (const r of input.rows) {
    const key = r.anonymousSessionId?.toLowerCase();
    if (key) {
      rowByKey.set(key, r);
    }
  }

  for (const key of deviceKeys) {
    const r = rowByKey.get(key);
    const p = input.presenceByDevice.get(key);
    parts.push(
      [
        key,
        field(r?.displayName),
        field(r?.updatedAt),
        field(r?.suspendedAt),
        field(r?.finishedAt),
        field(r?.gradedAt),
        field(p?.syncState),
        field(p?.pendingSyncCount),
        field(p?.lastActivityAt),
        field(p?.lastTypingAt),
        field(p?.lastSeenAt),
        field(p?.handRaiseQuestionId),
        field(p?.handRaisedAt),
      ].join("|"),
    );
  }

  return parts.join("\n");
}
