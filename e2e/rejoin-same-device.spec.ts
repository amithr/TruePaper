import { test, expect } from "@playwright/test";

import {
  joinStudentViaClassLink,
  loadE2eFixture,
  longStudentAnswer,
  readAnonymousDeviceId,
  studentClassLink,
  studentReportTabLeave,
  teacherLetStudentIn,
  typeStudentAnswerAndWaitForAutosave,
  waitForStudentJoin,
} from "./helpers";

test.describe.configure({ mode: "serial" });

test.describe("Rejoin on the same browser E2E", () => {
  let fixture: Awaited<ReturnType<typeof loadE2eFixture>>;

  test.beforeAll(async () => {
    fixture = await loadE2eFixture();
    test.skip(!fixture, "Set E2E_TEACHER_EMAIL and E2E_TEACHER_PASSWORD (see .env.example)");
  });

  test("re-scanning the class link offers Welcome back and keeps the answers", async ({ page, browser, request }) => {
    test.skip(!fixture);
    const displayName = "E2E Welcome Back";
    await joinStudentViaClassLink(page, fixture!.joinCode, displayName);
    await typeStudentAnswerAndWaitForAutosave(page, longStudentAnswer);
    const deviceId = await readAnonymousDeviceId(page);

    // The natural thing after a crash: open the class link / QR again. This used
    // to hand the student a brand-new identity and a blank exam. The page beacons
    // a tab leave on the way out; make that deterministic for the assertions below.
    await studentReportTabLeave(request, { liveSessionId: fixture!.liveSessionId, deviceId, displayName });
    await page.goto(studentClassLink(fixture!.joinCode));
    const card = page.getByTestId("student-welcome-back");
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText("Welcome back, E2E Welcome Back");
    await expect(card).toContainText("1 of 1 answered", { timeout: 15_000 });

    const joined = waitForStudentJoin(page);
    await page.getByTestId("student-welcome-back-continue").click();
    await joined;

    // Live mode: leaving the page counted as a tab leave, so the teacher lets them in —
    // with the friendlier "you're back" copy.
    const paused = page.getByTestId("student-exam-paused");
    await expect(paused).toBeVisible({ timeout: 20_000 });
    await expect(paused).toHaveAttribute("data-variant", "back");
    await teacherLetStudentIn(browser, fixture!.liveSessionId, deviceId);
    await expect(paused).toBeHidden({ timeout: 20_000 });

    await expect(page.getByTestId("student-exam-answer")).toHaveValue(longStudentAnswer, {
      timeout: 30_000,
    });
    expect(await readAnonymousDeviceId(page)).toBe(deviceId);
  });

  test("Not you? starts a fresh student on a shared computer", async ({ page }) => {
    test.skip(!fixture);
    await joinStudentViaClassLink(page, fixture!.joinCode, "E2E Lab Student One");
    await typeStudentAnswerAndWaitForAutosave(page, longStudentAnswer);
    const firstDeviceId = await readAnonymousDeviceId(page);

    await page.goto(studentClassLink(fixture!.joinCode));
    await expect(page.getByTestId("student-welcome-back")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("student-welcome-back-fresh").click();

    const joinSection = page.locator("#join-session");
    await expect(page.getByTestId("student-welcome-back")).toBeHidden();
    await expect(joinSection.getByPlaceholder("ABCD12")).toHaveValue(fixture!.joinCode);
    await expect(joinSection.getByPlaceholder("e.g. Jordan Lee")).toHaveValue("");
    expect(await readAnonymousDeviceId(page)).not.toBe(firstDeviceId);

    await joinSection.getByPlaceholder("e.g. Jordan Lee").fill("E2E Lab Student Two");
    const joined = waitForStudentJoin(page);
    await joinSection.getByTestId("student-join-submit").click();
    await joined;
    await expect(page.getByTestId("student-exam-answer")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("student-exam-answer")).toHaveValue("");
  });
});
