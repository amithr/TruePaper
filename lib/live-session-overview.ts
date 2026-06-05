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
  textQuestionIds: string[];
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
  /** Whether saved answers are synced to the server. */
  syncState: "synced" | "pending" | "offline";
  pendingSyncCount: number;
  updatedAt: string;
};

export type LiveSessionOverviewPayload = {
  session: LiveSessionOverviewSession;
  participants: LiveSessionOverviewParticipant[];
};
