import { chromium, type FullConfig } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

export type E2eFixture = {
  formId: string;
  questionId: string;
  liveSessionId: string;
  joinCode: string;
};

const authDir = path.join(__dirname, ".auth");
const sessionDir = path.join(__dirname, ".session");
const authFile = path.join(authDir, "teacher.json");
const fixtureFile = path.join(sessionDir, "fixture.json");

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = (config.projects[0]?.use?.baseURL as string) ?? "http://localhost:3000";
  const email = process.env.E2E_TEACHER_EMAIL?.trim();
  const password = process.env.E2E_TEACHER_PASSWORD;

  await fs.mkdir(authDir, { recursive: true });
  await fs.mkdir(sessionDir, { recursive: true });

  if (!email || !password) {
    const message =
      "Set E2E_TEACHER_EMAIL and E2E_TEACHER_PASSWORD (see .env.example). Register the teacher in the app first.";
    if (process.env.CI) {
      throw new Error(`E2E setup failed in CI: ${message}`);
    }
    await fs.writeFile(fixtureFile, JSON.stringify({ skipped: true, reason: message }));
    return;
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const message = "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY for E2E.";
    if (process.env.CI) {
      throw new Error(`E2E setup failed in CI: ${message}`);
    }
    await fs.writeFile(fixtureFile, JSON.stringify({ skipped: true, reason: message }));
    return;
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const request = context.request;

  const loginRes = await request.post("/api/auth/login", {
    data: { email, password },
  });
  if (!loginRes.ok()) {
    const body = await loginRes.text();
    throw new Error(`E2E teacher login failed (${loginRes.status()}): ${body}`);
  }

  const formRes = await request.post("/api/forms", {
    data: { title: `E2E Live Exam ${Date.now()}`, description: "Playwright E2E" },
  });
  if (!formRes.ok()) {
    throw new Error(`E2E create form failed: ${await formRes.text()}`);
  }
  const { form } = (await formRes.json()) as { form: { id: string } };

  const patchRes = await request.patch(`/api/forms/${form.id}`, {
    data: {
      title: "E2E Live Exam",
      description: "Playwright E2E",
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

  await context.storageState({ path: authFile });
  await fs.writeFile(fixtureFile, JSON.stringify(fixture, null, 2));
  await browser.close();
}

export { authFile, fixtureFile };
