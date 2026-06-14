import { requestJson } from "@/lib/request-json";

export type StartLiveSessionInput = {
  durationMinutes?: number;
  noTimeLimit?: boolean;
  deliveryMode?: "live" | "self_paced" | "hybrid";
  acceptLateSync?: boolean;
};

export type StartLiveSessionResult = {
  liveSessionId: string;
  joinCode: string;
  closesAt: string;
};

/** Create a live session for a form (teacher-authenticated API). */
export async function startLiveSession(
  formId: string,
  input: StartLiveSessionInput,
): Promise<StartLiveSessionResult> {
  const noTimeLimit = input.noTimeLimit === true;
  return requestJson<StartLiveSessionResult>(`/api/forms/${formId}/live-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(noTimeLimit ? { noTimeLimit: true } : { durationMinutes: input.durationMinutes ?? 45 }),
      deliveryMode: input.deliveryMode ?? "live",
      ...(input.acceptLateSync === false ? { acceptLateSync: false } : {}),
    }),
  });
}
