import { isRetryableNetworkError } from "@/lib/network-error";
import { requestJsonWithTimeout } from "@/lib/request-json";
import type { SyncResult } from "@/lib/offline/types";
import type { StudentAnswers } from "@/lib/forms";

const SUBMIT_TIMEOUT_MS = 20_000;

export async function submitExamToServer(input: {
  liveSessionId: string;
  deviceId: string;
  displayName: string;
  answers: StudentAnswers;
  submissionId: string;
}): Promise<SyncResult> {
  try {
    await requestJsonWithTimeout<{ ok: true }>(
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
      SUBMIT_TIMEOUT_MS,
    );
    await requestJsonWithTimeout<{ ok: true }>(
      `/api/public/live-sessions/${input.liveSessionId}/finish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: input.deviceId,
          displayName: input.displayName,
        }),
      },
      SUBMIT_TIMEOUT_MS,
    );
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Submit failed";
    return {
      ok: false,
      retryable: isRetryableNetworkError(e),
      message,
    };
  }
}
