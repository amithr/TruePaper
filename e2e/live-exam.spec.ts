import { test, expect } from "@playwright/test";
import path from "node:path";

import {
  joinStudentSession,
  loadE2eFixture,
  longStudentAnswer,
  readAnonymousDeviceId,
  teacherFeedbackMessage,
} from "./helpers";

const teacherAuth = path.join(__dirname, ".auth", "teacher.json");

test.describe.configure({ mode: "serial" });

test.describe("Live exam E2E", () => {
  let fixture: Awaited<ReturnType<typeof loadE2eFixture>>;
  let deviceId: string;

  test.beforeAll(async () => {
    fixture = await loadE2eFixture();
    test.skip(!fixture, "Set E2E_TEACHER_EMAIL and E2E_TEACHER_PASSWORD (see .env.example)");
  });

  test("student keeps full text through autosave cycles", async ({ page }) => {
    test.skip(!fixture);
    await joinStudentSession(page, fixture!.joinCode, "E2E Student Autosave");
    deviceId = await readAnonymousDeviceId(page);

    const answer = page.getByTestId("student-exam-answer");
    await answer.fill(longStudentAnswer);
    await expect(answer).toHaveValue(longStudentAnswer, { timeout: 15_000 });
    await expect(page.getByTestId("student-autosave-status")).toContainText(/saved/i, {
      timeout: 30_000,
    });

    await page.waitForTimeout(3500);
    await expect(answer).toHaveValue(longStudentAnswer);

    await answer.press("End");
    const withTail = `${longStudentAnswer} Extra tail after autosave.`;
    await answer.pressSequentially(" Extra tail after autosave.", { delay: 5 });
    await expect(answer).toHaveValue(withTail, { timeout: 15_000 });
    await expect(page.getByTestId("student-autosave-status")).toContainText(/saved/i, {
      timeout: 30_000,
    });
  });

  test("teacher watch page shows student answers updating", async ({ browser }) => {
    test.skip(!fixture || !deviceId);
    const context = await browser.newContext({ storageState: teacherAuth });
    const page = await context.newPage();

    await page.goto(
      `/dashboard/sessions/${fixture!.liveSessionId}/watch/${encodeURIComponent(deviceId)}`,
    );

    const watchAnswer = page.getByTestId("teacher-watch-answer");
    await expect(watchAnswer).toBeVisible({ timeout: 30_000 });
    await expect(watchAnswer).toContainText("Extra tail after autosave", { timeout: 25_000 });
    await context.close();
  });

  test("student receives live teacher feedback", async ({ browser }) => {
    test.skip(!fixture || !deviceId);

    const teacherContext = await browser.newContext({ storageState: teacherAuth });
    const teacherPage = await teacherContext.newPage();
    await teacherPage.goto(
      `/dashboard/sessions/${fixture!.liveSessionId}/watch/${encodeURIComponent(deviceId)}`,
    );
    const feedbackInput = teacherPage.getByTestId("teacher-live-feedback-input");
    await expect(feedbackInput).toBeVisible({ timeout: 30_000 });
    await feedbackInput.fill(teacherFeedbackMessage);
    await feedbackInput.blur();
    await expect(teacherPage.getByText(/Autosaved/i)).toBeVisible({ timeout: 15_000 });
    await teacherContext.close();

    const studentContext = await browser.newContext();
    await studentContext.addInitScript((id: string) => {
      window.localStorage.setItem("truepaper_anonymous_session_id", id);
    }, deviceId);
    const studentPage = await studentContext.newPage();
    await joinStudentSession(studentPage, fixture!.joinCode, "E2E Student Autosave", {
      freshDevice: false,
    });

    await expect(studentPage.getByTestId("student-teacher-feedback-body")).toContainText(
      teacherFeedbackMessage,
      { timeout: 20_000 },
    );
    await studentContext.close();
  });
});
