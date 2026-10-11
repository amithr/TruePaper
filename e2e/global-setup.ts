import { chromium, type APIRequestContext, type FullConfig } from "@playwright/test";
import fs from "node:fs/promises";

import { cleanupE2eAppData } from "./cleanup";
import {
  E2E_FORM_DESCRIPTION,
  E2E_FORM_TITLE,
  e2eAuthDir,
  e2eAuthFile,
  e2eFixtureFile,
  e2eSessionDir,
} from "./paths";

export type E2eFixture = {
  formId: string;
  questionId: string;
  liveSessionId: string;
  joinCode: string;
};

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = (config.projects[0]?.use?.baseURL as string) ?? "http://localhost:3000";
  const email = process.env.E2E_TEACHER_EMAIL?.trim();
  const password = process.env.E2E_TEACHER_PASSWORD;

  await fs.mkdir(e2eAuthDir, { recursive: true });
  await fs.mkdir(e2eSessionDir, { recursive: true });

  if (!email || !password) {
    const message =
      "Set E2E_TEACHER_EMAIL and E2E_TEACHER_PASSWORD (see .env.example). Register the teacher in the app first.";
    if (process.env.CI) {
      throw new Error(`E2E setup failed in CI: ${message}`);
    }
    await fs.writeFile(e2eFixtureFile, JSON.stringify({ skipped: true, reason: message }));
    return;
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const message = "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY for E2E.";
    if (process.env.CI) {
      throw new Error(`E2E setup failed in CI: ${message}`);
    }
    await fs.writeFile(e2eFixtureFile, JSON.stringify({ skipped: true, reason: message }));
    return;
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const request = context.request;

  // Drop leftovers from aborted prior runs before creating a fresh fixture.
  await loginTeacher(request, email, password);
  await cleanupE2eAppData(request, null);

  const formRes = await request.post("/api/forms", {
    data: { title: `${E2E_FORM_TITLE} ${Date.now()}`, description: E2E_FORM_DESCRIPTION },
  });
  if (!formRes.ok()) {
    throw new Error(`E2E create form failed: ${await formRes.text()}`);
  }
  const { form } = (await formRes.json()) as { form: { id: string } };

  const patchRes = await request.patch(`/api/forms/${form.id}`, {
    data: {
      title: E2E_FORM_TITLE,
      description: E2E_FORM_DESCRIPTION,
      liveTeacherFeedbackEnabled: true,
    },
  });
  if (!patchRes.ok()) {
    throw new Error(`E2E enable live feedback failed: ${await patchRes.text()}`);
  }

  const questionRes = await request.post(`/api/forms/${form.id}/questions`, {
    data: { type: "text", prompt: "Describe your answer in detail." },
  });
  if (!questionRes.ok()) {
    throw new Error(`E2E create question failed: ${await questionRes.text()}`);
  }
  const { question } = (await questionRes.json()) as { question: { id: string } };

  const sessionRes = await request.post(`/api/forms/${form.id}/live-sessions`, {
    data: { noTimeLimit: true },
  });
  if (!sessionRes.ok()) {
    throw new Error(`E2E start session failed: ${await sessionRes.text()}`);
  }
  const session = (await sessionRes.json()) as {
    liveSessionId: string;
    joinCode: string;
  };

  const fixture: E2eFixture = {
    formId: form.id,
    questionId: question.id,
    liveSessionId: session.liveSessionId,
    joinCode: session.joinCode,
  };

  await context.storageState({ path: e2eAuthFile });
  await fs.writeFile(e2eFixtureFile, JSON.stringify(fixture, null, 2));
  await browser.close();
}

async function loginTeacher(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<void> {
  const loginRes = await request.post("/api/auth/login", {
    data: { email, password },
  });
  if (!loginRes.ok()) {
    const body = await loginRes.text();
    throw new Error(`E2E teacher login failed (${loginRes.status()}): ${body}`);
  }
}

export { e2eAuthFile as authFile, e2eFixtureFile as fixtureFile };
