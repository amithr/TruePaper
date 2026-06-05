import { test, expect } from "@playwright/test";

import {
  joinStudentSession,
  loadE2eFixture,
  longStudentAnswer,
  offlineTailText,
  readAnonymousDeviceId,
  typeStudentAnswerAndWaitForAutosave,
  waitForStudentAnswersPut,
} from "./helpers";

test.describe.configure({ mode: "serial" });

test.describe("Offline exam sync E2E", () => {
  let fixture: Awaited<ReturnType<typeof loadE2eFixture>>;
  let deviceId: string;

  test.beforeAll(async () => {
    fixture = await loadE2eFixture();
    test.skip(!fixture, "Set E2E_TEACHER_EMAIL and E2E_TEACHER_PASSWORD (see .env.example)");
  });

  test("student keeps progress offline and syncs after reconnect", async ({ page, context }) => {
    test.skip(!fixture);
    await joinStudentSession(page, fixture!.joinCode, "E2E Offline Student");
    deviceId = await readAnonymousDeviceId(page);

    await typeStudentAnswerAndWaitForAutosave(page, longStudentAnswer);

    await context.setOffline(true);
    const answer = page.getByTestId("student-exam-answer");
    const offlineText = `${longStudentAnswer}${offlineTailText}`;
    await answer.press("End");
    await answer.pressSequentially(offlineTailText, { delay: 5 });
    await expect(answer).toHaveValue(offlineText, { timeout: 15_000 });
    await expect(page.getByTestId("connection-indicator")).toHaveAttribute("data-state", "offline", {
      timeout: 15_000,
    });

    await page.reload();
    await expect(page.getByTestId("student-exam-answer")).toHaveValue(offlineText, { timeout: 30_000 });

    const syncAfterReconnect = waitForStudentAnswersPut(page, 60_000);
    await context.setOffline(false);
    await syncAfterReconnect;
    await expect(page.getByTestId("connection-indicator")).toHaveAttribute(
      "data-state",
      /synced|online/,
      { timeout: 20_000 },
    );
  });
});
