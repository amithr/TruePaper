import { test, expect, type Browser, type Page } from "@playwright/test";

import {
  joinStudentSession,
  loadE2eFixture,
  longStudentAnswer,
  readAnonymousDeviceId,
  teacherDeclineRejoin,
  teacherLetStudentIn,
  teacherOverviewParticipants,
  typeStudentAnswerAndWaitForAutosave,
  waitForStudentJoin,
} from "./helpers";

test.describe.configure({ mode: "serial" });

/** Requires migration 20261023120000_device_rejoin_transfer.sql on the target database. */
test.describe("Rejoin on a new device E2E", () => {
  let fixture: Awaited<ReturnType<typeof loadE2eFixture>>;

  test.beforeAll(async () => {
    fixture = await loadE2eFixture();
    test.skip(!fixture, "Set E2E_TEACHER_EMAIL and E2E_TEACHER_PASSWORD (see .env.example)");
  });

  /** A second browser context = a different device: fresh localStorage + IndexedDB. */
  async function openSecondDeviceAndAskToContinue(browser: Browser, displayName: string): Promise<Page> {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/join?new=1");
    const joinSection = page.locator("#join-session");
    await expect(joinSection).toBeVisible({ timeout: 30_000 });
    await joinSection.getByPlaceholder("e.g. Jordan Lee").fill(displayName);
    await joinSection.getByPlaceholder("ABCD12").fill(fixture!.joinCode);
    const joined = waitForStudentJoin(page);
    await joinSection.getByTestId("student-join-submit").click();
    await joined;

    const card = page.getByTestId("student-rejoin-device");
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText(`Looks like ${displayName} already started on another device`);
    await expect(card).toContainText("1 of 1 answered");
    await page.getByTestId("student-rejoin-continue").click();
    await expect(page.getByTestId("student-rejoin-waiting")).toBeVisible({ timeout: 30_000 });
    return page;
  }

  test("the teacher's Let in moves the attempt to the new device", async ({ page: pageA, browser }) => {
    test.skip(!fixture);
    const name = "E2E Device Mover";
    await joinStudentSession(pageA, fixture!.joinCode, name);
    await typeStudentAnswerAndWaitForAutosave(pageA, longStudentAnswer);
    const deviceA = await readAnonymousDeviceId(pageA);

    const pageB = await openSecondDeviceAndAskToContinue(browser, name);
    const deviceB = await readAnonymousDeviceId(pageB);
    expect(deviceB).not.toBe(deviceA);

    // The request pauses the original device and shows the teacher who is asking.
    await expect(pageA.getByTestId("student-exam-paused")).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(
        async () =>
          (await teacherOverviewParticipants(browser, fixture!.liveSessionId)).find(
            (p) => p.anonymousSessionId.toLowerCase() === deviceA.toLowerCase(),
          )?.rejoinRequestedAt ?? null,
        { timeout: 20_000 },
      )
      .not.toBeNull();

    await teacherLetStudentIn(browser, fixture!.liveSessionId, deviceA);

    await expect(pageB.getByTestId("student-exam-answer")).toHaveValue(longStudentAnswer, {
      timeout: 30_000,
    });
    await expect(pageA.getByTestId("student-exam-moved")).toBeVisible({ timeout: 20_000 });

    const rows = (await teacherOverviewParticipants(browser, fixture!.liveSessionId)).filter(
      (p) => p.displayName === name,
    );
    expect(rows.map((p) => p.anonymousSessionId.toLowerCase())).toEqual([deviceB.toLowerCase()]);
    await pageB.context().close();
  });

  test("Not them keeps the attempt on the original device", async ({ page: pageA, browser }) => {
    test.skip(!fixture);
    const name = "E2E Device Stayer";
    await joinStudentSession(pageA, fixture!.joinCode, name);
    await typeStudentAnswerAndWaitForAutosave(pageA, longStudentAnswer);
    const deviceA = await readAnonymousDeviceId(pageA);

    const pageB = await openSecondDeviceAndAskToContinue(browser, name);
    await expect(pageA.getByTestId("student-exam-paused")).toBeVisible({ timeout: 20_000 });

    await teacherDeclineRejoin(browser, fixture!.liveSessionId, deviceA);

    await expect(pageB.getByTestId("student-rejoin-waiting")).toHaveAttribute("data-status", "declined", {
      timeout: 30_000,
    });
    // The request was the only reason the row was paused, so declining un-pauses it.
    await expect(pageA.getByTestId("student-exam-paused")).toBeHidden({ timeout: 20_000 });
    await expect(pageA.getByTestId("student-exam-answer")).toHaveValue(longStudentAnswer);
    await pageB.context().close();
  });
});
