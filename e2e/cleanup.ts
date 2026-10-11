import type { APIRequestContext } from "@playwright/test";

import { isE2eForm } from "./paths";

type FixtureIds = {
  formId?: string;
  liveSessionId?: string;
};

type FormSummary = {
  id: string;
  title?: string | null;
  description?: string | null;
};

type SessionSummary = {
  id: string;
  formId: string;
  formTitle: string;
};

/**
 * Stop a live session (ignores already-closed / missing), then delete it.
 * Deleting the form also cascades sessions; this path is for explicit session cleanup.
 */
export async function stopAndDeleteSession(
  request: APIRequestContext,
  liveSessionId: string,
): Promise<void> {
  const stopRes = await request.post(`/api/forms/live-sessions/${liveSessionId}/stop`);
  // Already closed / missing are fine.
  if (!stopRes.ok() && ![404, 409, 400].includes(stopRes.status())) {
    console.warn(
      `[e2e teardown] stop session ${liveSessionId} → ${stopRes.status()}: ${await stopRes.text()}`,
    );
  }

  const deleteRes = await request.delete(`/api/forms/live-sessions/${liveSessionId}`);
  if (!deleteRes.ok() && deleteRes.status() !== 404) {
    console.warn(
      `[e2e teardown] delete session ${liveSessionId} → ${deleteRes.status()}: ${await deleteRes.text()}`,
    );
  }
}

export async function deleteForm(request: APIRequestContext, formId: string): Promise<void> {
  const res = await request.delete(`/api/forms/${formId}`);
  if (!res.ok() && res.status() !== 404) {
    console.warn(`[e2e teardown] delete form ${formId} → ${res.status()}: ${await res.text()}`);
  }
}

/** Tear down the fixture from this run, then sweep any leftover E2E forms/sessions. */
export async function cleanupE2eAppData(
  request: APIRequestContext,
  fixture: FixtureIds | null,
): Promise<void> {
  if (fixture?.liveSessionId) {
    await stopAndDeleteSession(request, fixture.liveSessionId);
  }
  if (fixture?.formId) {
    await deleteForm(request, fixture.formId);
  }

  await sweepLeftoverE2eData(request);
}

async function listForms(request: APIRequestContext): Promise<FormSummary[]> {
  const res = await request.get("/api/forms?summary=1");
  if (!res.ok()) {
    console.warn(`[e2e teardown] list forms → ${res.status()}: ${await res.text()}`);
    return [];
  }
  const body = (await res.json()) as { forms?: FormSummary[] };
  return body.forms ?? [];
}

async function listSessions(
  request: APIRequestContext,
  scope: "active" | "past",
): Promise<SessionSummary[]> {
  const res = await request.get(
    scope === "past"
      ? "/api/teacher/sessions?scope=past&page=0&limit=50"
      : "/api/teacher/sessions?scope=active",
  );
  if (!res.ok()) {
    console.warn(`[e2e teardown] list ${scope} sessions → ${res.status()}: ${await res.text()}`);
    return [];
  }
  const body = (await res.json()) as { sessions?: SessionSummary[] };
  return body.sessions ?? [];
}

async function sweepLeftoverE2eData(request: APIRequestContext): Promise<void> {
  const e2eFormIds = new Set<string>();

  for (const scope of ["active", "past"] as const) {
    const sessions = await listSessions(request, scope);
    for (const session of sessions) {
      if (!isE2eForm({ title: session.formTitle })) {
        continue;
      }
      e2eFormIds.add(session.formId);
      await stopAndDeleteSession(request, session.id);
    }
  }

  const forms = await listForms(request);
  for (const form of forms) {
    if (!isE2eForm(form) && !e2eFormIds.has(form.id)) {
      continue;
    }
    await deleteForm(request, form.id);
  }
}
