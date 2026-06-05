import { requestJson } from "@/lib/request-json";
import type { SyncResult } from "@/lib/offline/types";

export async function putStudentAnswersSync(input: {
  liveSessionId: string;
  deviceId: string;
  displayName: string;
  answers: Record<string, string>;
  submissionId: string;
}): Promise<SyncResult> {
  try {
    const result = await requestJson<{ ok: true; deduped?: boolean }>(
      `/api/public/live-sessions/${input.liveSessionId}/responses`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: input.deviceId,
          displayName: input.displayName,
          answers: input.answers,
          submissionId: input.submissionId,
        }),
      },
    );
    return { ok: true, deduped: result.deduped };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    const retryable =
      typeof navigator !== "undefined" &&
      (!navigator.onLine ||
        message.includes("Failed to fetch") ||
        message.includes("NetworkError") ||
        message.includes("503"));
    return { ok: false, retryable, message };
  }
}
