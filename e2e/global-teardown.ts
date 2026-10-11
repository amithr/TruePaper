import { chromium, type FullConfig } from "@playwright/test";
import fs from "node:fs/promises";

import { cleanupE2eAppData } from "./cleanup";
import type { E2eFixture } from "./global-setup";
import { e2eAuthFile, e2eFixtureFile } from "./paths";

/**
 * After the E2E suite (pass or fail), stop/delete the fixture session and form,
 * and sweep any leftover Playwright E2E forms/sessions for the teacher account.
 */
export default async function globalTeardown(config: FullConfig): Promise<void> {
  const baseURL = (config.projects[0]?.use?.baseURL as string) ?? "http://localhost:3000";
  const email = process.env.E2E_TEACHER_EMAIL?.trim();
  const password = process.env.E2E_TEACHER_PASSWORD;

  let fixture: (E2eFixture & { skipped?: boolean }) | null = null;
  try {
    const raw = await fs.readFile(e2eFixtureFile, "utf8");
    fixture = JSON.parse(raw) as E2eFixture & { skipped?: boolean };
  } catch {
    fixture = null;
  }

  if (fixture?.skipped) {
    return;
  }

  if (!email || !password) {
    return;
  }

  const browser = await chromium.launch();
  try {
    // Prefer the storage state from setup so we reuse the same session cookies.
    let context;
    try {
      await fs.access(e2eAuthFile);
      context = await browser.newContext({ baseURL, storageState: e2eAuthFile });
    } catch {
      context = await browser.newContext({ baseURL });
      const loginRes = await context.request.post("/api/auth/login", {
        data: { email, password },
      });
      if (!loginRes.ok()) {
        console.warn(
          `[e2e teardown] login failed (${loginRes.status()}): ${await loginRes.text()}`,
        );
        return;
      }
    }

    await cleanupE2eAppData(context.request, fixture);
    await context.close();
  } finally {
    await browser.close();
  }
}
