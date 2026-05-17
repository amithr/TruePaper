import type { SupabaseClient } from "@supabase/supabase-js";

import type { StudentExamRemotePatch } from "@/lib/student-exam-remote-patch";

export const STUDENT_EXAM_BROADCAST_EVENT = "exam_patch";

export function studentExamChannelName(liveSessionId: string, deviceId: string): string {
  return `student-exam:${liveSessionId}:${deviceId.toLowerCase()}`;
}

/** Push a patch to the student's open exam tab (Supabase Realtime broadcast). */
export async function broadcastStudentExamPatch(
  supabase: SupabaseClient,
  liveSessionId: string,
  deviceId: string,
  patch: StudentExamRemotePatch,
): Promise<void> {
  const channelName = studentExamChannelName(liveSessionId, deviceId);
  const channel = supabase.channel(channelName);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      void supabase.removeChannel(channel);
      reject(new Error("broadcast subscribe timeout"));
    }, 8000);

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        try {
          await channel.send({
            type: "broadcast",
            event: STUDENT_EXAM_BROADCAST_EVENT,
            payload: patch,
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
