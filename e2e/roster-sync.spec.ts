import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import path from "node:path";

import {
  joinStudentSession,
  loadE2eFixture,
  readAnonymousDeviceId,
  sendStudentHeartbeat,
  typeStudentAnswerAndWaitForAutosave,
  longStudentAnswer,
} from "./helpers";

const teacherAuth = path.join(__dirname, ".auth", "teacher.json");

test.describe.configure({ mode: "serial" });

/**
 * The roster row for one student. Earlier specs leave other students in the session,
 * and the roster opens on "Needs attention" when any of them need it, which would
 * hide a working student — so switch to "All" first.
 */
async function rosterRow(teacherPage: Page, displayName: string) {
  const allFilter = teacherPage.getByRole("button", { name: /^All/ });
  await expect(allFilter).toBeVisible({ timeout: 30_000 });
  await allFilter.click();
  await expect(allFilter).toHaveAttribute("aria-pressed", "true");
  return teacherPage.getByTestId("roster-row").filter({ hasText: displayName });
}

/**
 * Cut the student browser's network so its own heartbeats stop and can't overwrite
 * the synthetic sync state before the teacher roster polls it. (Navigating away
 * would trigger a tab-leave suspension, which outranks offline in the roster.)
 */
async function silenceStudentClient(context: BrowserContext) {
  await context.setOffline(true);
}

test.describe("Teacher roster sync status E2E", () => {
  let fixture: Awaited<ReturnType<typeof loadE2eFixture>>;

  test.beforeAll(async () => {
    fixture = await loadE2eFixture();
    test.skip(!fixture, "Set E2E_TEACHER_EMAIL and E2E_TEACHER_PASSWORD (see .env.example)");
  });

  test("teacher sees offline status on roster", async ({ page, context, request, browser }) => {
    test.skip(!fixture);
    await joinStudentSession(page, fixture!.joinCode, "E2E Roster Sync");
    const deviceId = await readAnonymousDeviceId(page);
    await typeStudentAnswerAndWaitForAutosave(page, longStudentAnswer);
    await silenceStudentClient(context);

    await sendStudentHeartbeat(request, {
      liveSessionId: fixture!.liveSessionId,
      deviceId,
      displayName: "E2E Roster Sync",
      pendingSyncCount: 2,
      syncState: "offline",
    });

    const teacherContext = await browser.newContext({ storageState: teacherAuth });
    const teacherPage = await teacherContext.newPage();
    await teacherPage.goto(`/dashboard/sessions/${fixture!.liveSessionId}`);

    const row = await rosterRow(teacherPage, "E2E Roster Sync");
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toHaveAttribute("data-sync-state", "offline", { timeout: 15_000 });
    await expect(row.getByTestId("roster-status-line")).toContainText(/offline/i);
    await teacherContext.close();
  });

  test("teacher sees pending sync in the roster sync summary", async ({ page, context, request, browser }) => {
    test.skip(!fixture);
    await joinStudentSession(page, fixture!.joinCode, "E2E Pending Sync", { freshDevice: true });
    const deviceId = await readAnonymousDeviceId(page);
    await silenceStudentClient(context);

    await sendStudentHeartbeat(request, {
      liveSessionId: fixture!.liveSessionId,
      deviceId,
      displayName: "E2E Pending Sync",
      pendingSyncCount: 3,
      syncState: "pending",
    });

    const teacherContext = await browser.newContext({ storageState: teacherAuth });
    const teacherPage = await teacherContext.newPage();
    await teacherPage.goto(`/dashboard/sessions/${fixture!.liveSessionId}`);

    const row = await rosterRow(teacherPage, "E2E Pending Sync");
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toHaveAttribute("data-sync-state", "pending", { timeout: 15_000 });

    // The roster-level chip names everyone whose work hasn't reached the server yet.
    const summary = teacherPage.getByTestId("roster-sync-summary");
    await expect(summary).toBeVisible({ timeout: 15_000 });
    await summary.click();
    await expect(teacherPage.locator(".tp-roster-sync__list")).toContainText("E2E Pending Sync");
    await teacherContext.close();
  });
});
