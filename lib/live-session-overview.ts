import type { RosterPreviewQuestion } from "@/lib/live-typing-preview";
import type { LiveParticipantUiStatus } from "@/lib/participant-status";

export type LiveSessionOverviewSession = {
  id: string;
  joinCode: string;
  opensAt: string;
  closesAt: string;
  formId: string;
  formTitle: string;
  sessionOpen: boolean;
  questionTotal: number;
  /** @deprecated Prefer previewQuestions — kept for older clients. */
  textQuestionIds: string[];
  previewQuestions: RosterPreviewQuestion[];
};

export type LiveSessionOverviewParticipant = {
  anonymousSessionId: string;
  displayName: string;
  status: LiveParticipantUiStatus;
  suspendedAt: string | null;
  finishedAt: string | null;
  gradedAt: string | null;
  pointsEarned: number | null;
  pointsPossible: number | null;
  answeredCount: number;
  /** Saved text preview (longest text answer) for roster subtitle. */
  textPreview: string;
  /** Word count on text questions from saved answers. */
  textWordCount: number;
  lastActivityAt: string | null;
  lastTypingAt: string | null;
  /** Last heartbeat of any kind (incl. idle keepalive) — detects silent disconnects. */
  lastSeenAt: string | null;
  /** Whether saved answers are synced to the server. */
  syncState: "synced" | "pending" | "offline";
  pendingSyncCount: number;
  updatedAt: string;
  /** When set, the student raised their hand on this question. */
  handRaiseQuestionId: string | null;
  handRaisedAt: string | null;
};

export type LiveSessionOverviewPayload = {
  session: LiveSessionOverviewSession;
  participants: LiveSessionOverviewParticipant[];
  /** ISO server timestamp at response time — lets the client correct clock skew. */
  serverNow: string;
};
