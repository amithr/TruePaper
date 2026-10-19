import { test, expect } from "@playwright/test";

import {
  joinStudentSession,
  loadE2eFixture,
  longStudentAnswer,
  offlineTailText,
  readAnonymousDeviceId,
  reloadStudentExamWithOfflineEdits,
  teacherLetStudentIn,
  typeStudentAnswerAndWaitForAutosave,
  waitForStudentAnswersPutContaining,
} from "./helpers";

test.describe.configure({ mode: "serial" });

test.describe("Offline exam sync E2E", () => {
  let fixture: Awaited<ReturnType<typeof loadE2eFixture>>;

  test.beforeAll(async () => {
    fixture = await loadE2eFixture();
    test.skip(!fixture, "Set E2E_TEACHER_EMAIL and E2E_TEACHER_PASSWORD (see .env.example)");
  });

  test("student keeps progress offline and syncs after reconnect", async ({ page, context, browser }) => {
    test.skip(!fixture);
    await joinStudentSession(page, fixture!.joinCode, "E2E Offline Student");
    const deviceId = await readAnonymousDeviceId(page);

    await typeStudentAnswerAndWaitForAutosave(page, longStudentAnswer);

    await context.setOffline(true);
    const answer = page.getByTestId("student-exam-answer");
    const offlineText = `${longStudentAnswer}${offlineTailText}`;
    await answer.press("End");
    await answer.pressSequentially(offlineTailText, { delay: 5 });
    await expect(answer).toHaveValue(offlineText, { timeout: 15_000 });
    // The exam header sync line switches off "saved" while edits are queued locally.
    const syncStatus = page.getByTestId("student-sync-status");
    await expect(syncStatus).toHaveAttribute("data-kind", /saving|reconnect/, {
      timeout: 15_000,
    });
    // Offline autosave debounces before writing to IndexedDB.
    await page.waitForTimeout(500);

    await reloadStudentExamWithOfflineEdits(page, context);
    // The server never received the tail, so this proves it came back from IndexedDB.
    await expect(answer).toHaveValue(offlineText, { timeout: 30_000 });

    // In live mode a reload counts as leaving the tab: the student is paused until
    // the teacher lets them back in, and answer sync waits for that.
    await expect(page.getByTestId("student-exam-paused")).toBeVisible({ timeout: 20_000 });

    const syncAfterReconnect = waitForStudentAnswersPutContaining(
      page,
      "Offline tail saved locally",
      60_000,
    );
    await context.setOffline(false);
    await teacherLetStudentIn(browser, fixture!.liveSessionId, deviceId);
    await expect(page.getByTestId("student-exam-paused")).toBeHidden({ timeout: 20_000 });
    await syncAfterReconnect;
    await expect(syncStatus).toHaveAttribute("data-kind", "saved", { timeout: 20_000 });
  });
});
