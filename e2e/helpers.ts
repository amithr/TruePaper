import fs from "node:fs/promises";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

import type { E2eFixture } from "./global-setup";

const fixtureFile = path.join(__dirname, ".session", "fixture.json");

export async function loadE2eFixture(): Promise<E2eFixture | null> {
  try {
    const raw = await fs.readFile(fixtureFile, "utf8");
    const parsed = JSON.parse(raw) as E2eFixture & { skipped?: boolean };
    if (parsed.skipped || !parsed.joinCode) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Resolves when the student PUT autosave request succeeds. */
export function waitForStudentAnswersPut(page: Page, timeout = 45_000) {
  return page.waitForResponse(
    (res) =>
      res.request().method() === "PUT" &&
      /\/api\/public\/live-sessions\/[^/]+\/responses/.test(res.url()) &&
      res.ok(),
    { timeout },
  );
}

export async function joinStudentSession(
  page: Page,
  joinCode: string,
  displayName: string,
  options?: { freshDevice?: boolean },
): Promise<void> {
  const fresh = options?.freshDevice !== false;
  const query = fresh
    ? `new=1&code=${encodeURIComponent(joinCode)}`
    : `code=${encodeURIComponent(joinCode)}`;
  await page.goto(`/?${query}`);
  await page.waitForLoadState("domcontentloaded");

  await expect(page.getByTestId("student-join-submit")).toBeVisible({ timeout: 30_000 });
  await page.getByPlaceholder("e.g. Jordan Lee").fill(displayName);
  await expect(page.getByPlaceholder("ABCD12")).toHaveValue(joinCode);

  const joinButton = page.getByTestId("student-join-submit");
  const examAnswer = page.getByTestId("student-exam-answer");

  // Join links auto-join once the name is valid; otherwise use the Join button.
  try {
    await examAnswer.waitFor({ state: "visible", timeout: 12_000 });
  } catch {
    await expect(joinButton).toBeEnabled({ timeout: 30_000 });
    await joinButton.click();
    await expect(examAnswer).toBeVisible({ timeout: 30_000 });
  }

  await expect(examAnswer).toBeEnabled({ timeout: 30_000 });
}

/** Type into the exam answer and wait until autosave persists to the server. */
export async function typeStudentAnswerAndWaitForAutosave(
  page: Page,
  text: string,
): Promise<void> {
  const answer = page.getByTestId("student-exam-answer");
  const status = page.getByTestId("student-autosave-status");

  await expect(answer).toBeVisible();
  await expect(answer).toBeEnabled();
  await expect(status).toBeAttached({ timeout: 15_000 });

  const saved = waitForStudentAnswersPut(page);
  await answer.click();
  await answer.fill(text);
  await expect(answer).toHaveValue(text, { timeout: 15_000 });

  // Playwright fill can update the DOM before React state; a small edit guarantees input events.
  await answer.press("End");
  await answer.press(" ");
  await answer.press("Backspace");

  await saved;
  await expect(status).toContainText(/saved/i, { timeout: 10_000 });
}

/** Wait for the next successful student autosave after edits are already in flight. */
export async function waitForNextStudentAutosave(page: Page, timeout = 45_000): Promise<void> {
  const saved = waitForStudentAnswersPut(page, timeout);
  await saved;
  await expect(page.getByTestId("student-autosave-status")).toContainText(/saved/i, {
    timeout: 10_000,
  });
}

export async function readAnonymousDeviceId(page: Page): Promise<string> {
  const deviceId = await page.evaluate(() =>
    window.localStorage.getItem("truepaper_anonymous_session_id"),
  );
  if (!deviceId) {
    throw new Error("Student device id missing from localStorage after join");
  }
  return deviceId;
}

export const longStudentAnswer =
  "E2E autosave check: students must keep the full essay visible while saves run. " +
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(4);

export const teacherFeedbackMessage =
  "E2E feedback: Strong start — add more detail in your second paragraph.";
