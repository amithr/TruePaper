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

/** Wait for a successful student-side join API response. */
export function waitForStudentJoin(page: Page, timeout = 45_000) {
  return page.waitForResponse(
    (res) =>
      res.request().method() === "GET" &&
      res.url().includes("/api/public/join") &&
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
  // Student join lives on `/join` (guests no longer see the form on `/`).
  // `new=1` triggers a fresh anonymous device id.
  await page.goto(fresh ? `/join?new=1` : `/join`);
  await page.waitForLoadState("domcontentloaded");

  const joinSection = page.locator("#join-session");
  await expect(joinSection).toBeVisible({ timeout: 30_000 });

  const nameInput = joinSection.getByPlaceholder("e.g. Jordan Lee");
  const codeInput = joinSection.getByPlaceholder("ABCD12");
  await nameInput.fill(displayName);
  await codeInput.fill(joinCode);
  await expect(codeInput).toHaveValue(joinCode);

  const joinButton = joinSection.getByTestId("student-join-submit");
  await expect(joinButton).toBeEnabled({ timeout: 30_000 });

  const joinResponse = waitForStudentJoin(page);
  await joinButton.click();
  await joinResponse;

  const examAnswer = page.getByTestId("student-exam-answer");
  await expect(examAnswer).toBeVisible({ timeout: 30_000 });
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

export async function sendStudentHeartbeat(
  page: Page,
  input: {
    liveSessionId: string;
    deviceId: string;
    displayName: string;
    pendingSyncCount?: number;
    syncState?: "synced" | "pending" | "offline";
  },
): Promise<void> {
  const res = await page.request.post(
    `/api/public/live-sessions/${input.liveSessionId}/heartbeat`,
    {
      data: {
        deviceId: input.deviceId,
        displayName: input.displayName,
        isTyping: false,
        interaction: true,
        pendingSyncCount: input.pendingSyncCount ?? 0,
        syncState: input.syncState ?? "synced",
      },
    },
  );
  expect(res.ok()).toBeTruthy();
}

export const offlineTailText = " Offline tail saved locally.";
