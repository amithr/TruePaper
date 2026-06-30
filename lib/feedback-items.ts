import type { FeedbackQueueItem, FeedbackQueueStatus } from "@/lib/offline/types";

/** A feedback item as returned by the teacher read RPC (already on the server). */
export type ServerFeedbackItem = {
  id: string;
  questionId: string | null;
  authorId: string;
  authorName: string;
  type: "text" | "voice";
  body: string;
  createdAt: string;
  syncedAt: string | null;
  deliveredAt: string | null;
  isOwn: boolean;
};

/** A feedback item as the student sees it (no author identity beyond name). */
export type StudentFeedbackItem = {
  id: string;
  questionId: string | null;
  authorName: string;
  type: "text" | "voice";
  body: string;
  createdAt: string;
  versionChanged: boolean;
};

/** Unified status the teacher UI shows for one item, local queue or server. */
export type TeacherFeedbackDisplayStatus =
  | FeedbackQueueStatus
  | "synced"
  | "delivered";

export type TeacherFeedbackDisplayItem = {
  id: string;
  questionId: string | null;
  authorName: string;
  body: string;
  /** ms epoch, authoritative for ordering/display. */
  createdAt: number;
  status: TeacherFeedbackDisplayStatus;
  isOwn: boolean;
  /** True for items still in the local queue (editable/removable directly). */
  isLocal: boolean;
  lastError: string | null;
};

function localToDisplay(item: FeedbackQueueItem): TeacherFeedbackDisplayItem {
  return {
    id: item.id,
    questionId: item.questionId,
    authorName: item.authorName,
    body: item.body,
    createdAt: item.createdAt,
    status: item.status,
    isOwn: true,
    isLocal: true,
    lastError: item.lastError,
  };
}

function serverToDisplay(item: ServerFeedbackItem): TeacherFeedbackDisplayItem {
  return {
    id: item.id,
    questionId: item.questionId,
    authorName: item.authorName,
    body: item.body,
    createdAt: new Date(item.createdAt).getTime(),
    status: item.deliveredAt ? "delivered" : "synced",
    isOwn: item.isOwn,
    isLocal: false,
    lastError: null,
  };
}

/**
 * Merge the local queue (not-yet-synced, authored on this device) with the
 * server list (synced/delivered + co-teachers). Local rows win while an id is
 * still pending; once the server has the item the local row is gone and the
 * server copy (with delivery status) takes over. Ordered by authoritative
 * createdAt.
 */
export function mergeFeedbackForTeacher(
  local: FeedbackQueueItem[],
  server: ServerFeedbackItem[],
): TeacherFeedbackDisplayItem[] {
  const byId = new Map<string, TeacherFeedbackDisplayItem>();
  for (const item of server) {
    byId.set(item.id, serverToDisplay(item));
  }
  for (const item of local) {
    byId.set(item.id, localToDisplay(item));
  }
  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
}
