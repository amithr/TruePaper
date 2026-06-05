import { test, expect } from "@playwright/test";
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

test.describe("Teacher roster sync badges E2E", () => {
  let fixture: Awaited<ReturnType<typeof loadE2eFixture>>;

  test.beforeAll(async () => {
    fixture = await loadE2eFixture();
    test.skip(!fixture, "Set E2E_TEACHER_EMAIL and E2E_TEACHER_PASSWORD (see .env.example)");
  });

  test("teacher sees offline sync badge on roster", async ({ page, browser }) => {
    test.skip(!fixture);
    await joinStudentSession(page, fixture!.joinCode, "E2E Roster Sync");
    const deviceId = await readAnonymousDeviceId(page);
    await typeStudentAnswerAndWaitForAutosave(page, longStudentAnswer);

    await sendStudentHeartbeat(page, {
      liveSessionId: fixture!.liveSessionId,
      deviceId,
      displayName: "E2E Roster Sync",
      pendingSyncCount: 2,
      syncState: "offline",
    });

    const teacherContext = await browser.newContext({ storageState: teacherAuth });
    const teacherPage = await teacherContext.newPage();
    await teacherPage.goto(`/dashboard/sessions/${fixture!.liveSessionId}`);

    const badge = teacherPage.getByTestId("roster-sync-badge").first();
    await expect(badge).toBeVisible({ timeout: 30_000 });
    await expect(badge).toHaveAttribute("data-sync-state", "offline");
    await expect(badge).toContainText(/offline/i);
    await teacherContext.close();
  });

  test("teacher sees pending sync badge on roster", async ({ page, browser }) => {
    test.skip(!fixture);
    await joinStudentSession(page, fixture!.joinCode, "E2E Pending Sync", { freshDevice: true });
    const deviceId = await readAnonymousDeviceId(page);

    await sendStudentHeartbeat(page, {
      liveSessionId: fixture!.liveSessionId,
      deviceId,
      displayName: "E2E Pending Sync",
      pendingSyncCount: 3,
      syncState: "pending",
    });

    const teacherContext = await browser.newContext({ storageState: teacherAuth });
    const teacherPage = await teacherContext.newPage();
    await teacherPage.goto(`/dashboard/sessions/${fixture!.liveSessionId}`);

    const badge = teacherPage.getByTestId("roster-sync-badge").first();
    await expect(badge).toBeVisible({ timeout: 30_000 });
    await expect(badge).toHaveAttribute("data-sync-state", "pending");
    await expect(badge).toContainText(/3/);
    await teacherContext.close();
  });
});
