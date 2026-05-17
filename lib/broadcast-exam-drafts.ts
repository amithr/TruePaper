import type { SupabaseClient } from "@supabase/supabase-js";

import type { StudentAnswers } from "@/lib/forms";
import type { LiveTeacherFeedbackByQuestionId } from "@/lib/live-teacher-feedback";
import { studentExamChannelName } from "@/lib/student-exam-channel";
import { teacherWatchChannelName } from "@/lib/broadcast-teacher-watch";

export const TEACHER_WATCH_ANSWER_DRAFT_EVENT = "watch_answer_draft";
export const STUDENT_EXAM_FEEDBACK_DRAFT_EVENT = "feedback_draft";

type BroadcastSendOptions = {
  channelName: string;
  event: string;
  payload: Record<string, unknown>;
};

async function sendBroadcast(
  supabase: SupabaseClient,
  { channelName, event, payload }: BroadcastSendOptions,
): Promise<void> {
  const channel = supabase.channel(channelName);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      void supabase.removeChannel(channel);
      reject(new Error("broadcast timeout"));
    }, 8000);

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        try {
          await channel.send({
            type: "broadcast",
            event,
            payload,
          });
        } finally {
          void supabase.removeChannel(channel);
          resolve();
        }
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeout);
        void supabase.removeChannel(channel);
        reject(new Error(`broadcast channel ${status}`));
      }
    });
  });
}

/** Ephemeral student answers while typing (before autosave lands in postgres). */
export async function broadcastTeacherWatchAnswerDraft(
  supabase: SupabaseClient,
  liveSessionId: string,
  deviceId: string,
  answers: StudentAnswers,
): Promise<void> {
  const sessionId = liveSessionId.trim();
  const deviceNorm = deviceId.trim().toLowerCase();
  if (!sessionId || !deviceNorm) {
    return;
  }

  await sendBroadcast(supabase, {
    channelName: teacherWatchChannelName(sessionId, deviceNorm),
    event: TEACHER_WATCH_ANSWER_DRAFT_EVENT,
    payload: { answers, at: new Date().toISOString() },
  });
}

/** Ephemeral teacher feedback while typing (before PATCH save). */
export async function broadcastStudentFeedbackDraft(
  supabase: SupabaseClient,
  liveSessionId: string,
  deviceId: string,
  questionId: string,
  message: string,
): Promise<void> {
  const sessionId = liveSessionId.trim();
  const deviceNorm = deviceId.trim().toLowerCase();
  const qid = questionId.trim();
  if (!sessionId || !deviceNorm || !qid) {
    return;
  }

  await sendBroadcast(supabase, {
    channelName: studentExamChannelName(sessionId, deviceNorm),
    event: STUDENT_EXAM_FEEDBACK_DRAFT_EVENT,
    payload: { questionId: qid, message, at: new Date().toISOString() },
  });
}

/** Full feedback map draft (e.g. after merging local drafts). */
export async function broadcastStudentFeedbackDraftMap(
  supabase: SupabaseClient,
  liveSessionId: string,
  deviceId: string,
  liveTeacherFeedback: LiveTeacherFeedbackByQuestionId,
): Promise<void> {
  const sessionId = liveSessionId.trim();
  const deviceNorm = deviceId.trim().toLowerCase();
  if (!sessionId || !deviceNorm) {
    return;
  }

  await sendBroadcast(supabase, {
    channelName: studentExamChannelName(sessionId, deviceNorm),
    event: STUDENT_EXAM_FEEDBACK_DRAFT_EVENT,
    payload: { liveTeacherFeedback, at: new Date().toISOString() },
  });
}
