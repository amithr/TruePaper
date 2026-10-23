import fs from "node:fs/promises";
import {
  expect,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
  type Route,
} from "@playwright/test";

import type { E2eFixture } from "./global-setup";
import { e2eAuthFile, e2eFixtureFile } from "./paths";

export async function loadE2eFixture(): Promise<E2eFixture | null> {
  try {
    const raw = await fs.readFile(e2eFixtureFile, "utf8");
    const parsed = JSON.parse(raw) as E2eFixture & { skipped?: boolean };
    if (parsed.skipped || !parsed.joinCode) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

const studentResponsesUrl = /\/api\/public\/live-sessions\/[^/]+\/responses/;

function blockStudentAnswerPut(route: Route) {
  if (route.request().method() === "PUT" && studentResponsesUrl.test(route.request().url())) {
    return route.abort("failed");
  }
  return route.continue();
}

/** Resolves when the student PUT autosave request succeeds. */
export function waitForStudentAnswersPut(page: Page, timeout = 45_000) {
  return page.waitForResponse(
    (res) =>
      res.request().method() === "PUT" &&
      studentResponsesUrl.test(res.url()) &&
      res.ok(),
    { timeout },
  );
}

/** Resolves when a student PUT autosave includes the given answer snippet. */
export function waitForStudentAnswersPutContaining(
  page: Page,
  textSnippet: string,
  timeout = 45_000,
) {
  return page.waitForResponse(
    async (res) => {
      if (
        res.request().method() !== "PUT" ||
        !studentResponsesUrl.test(res.url()) ||
        !res.ok()
      ) {
        return false;
      }
      try {
        const body = (await res.request().postDataJSON()) as { answers?: Record<string, string> };
        return Object.values(body.answers ?? {}).some((value) => value.includes(textSnippet));
      } catch {
        return false;
      }
    },
    { timeout },
  );
}

/**
 * Reload the student exam after offline edits. A full reload needs network for the
 * document and its JS chunks (the dev server has no offline shell), so stay online
 * with answer PUTs blocked until the exam is back, then cut the network again. The
 * page should reopen the exam by itself (remembered on this device) — no rejoin —
 * and since the server never received the offline edits, the answer can only come
 * back from IndexedDB.
 */
export async function reloadStudentExamWithOfflineEdits(
  page: Page,
  context: BrowserContext,
): Promise<void> {
  await page.route(studentResponsesUrl, blockStudentAnswerPut);
  await context.setOffline(false);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("student-exam-answer")).toBeVisible({ timeout: 30_000 });
  } finally {
    await context.setOffline(true);
    await page.unroute(studentResponsesUrl, blockStudentAnswerPut);
  }
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

  // Join triggers a hydration autosave; let it finish so later PUT waiters are not fooled.
  await expect
    .poll(
      async () => {
        const text = await page.getByTestId("student-autosave-status").textContent();
        return text?.match(/saved/i) != null || text?.trim() === "";
      },
      { timeout: 15_000 },
    )
    .toBe(true);
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

  await answer.click();
  await answer.fill(text);
  await expect(answer).toHaveValue(text, { timeout: 15_000 });

  // Register the PUT waiter after fill so we do not resolve on an earlier hydration autosave.
  const saved = page.waitForResponse(
    async (res) => {
      if (
        res.request().method() !== "PUT" ||
        !/\/api\/public\/live-sessions\/[^/]+\/responses/.test(res.url()) ||
        !res.ok()
      ) {
        return false;
      }
      try {
        const body = (await res.request().postDataJSON()) as { answers?: Record<string, string> };
        return Object.values(body.answers ?? {}).some((value) => value.includes(text));
      } catch {
        return false;
      }
    },
    { timeout: 45_000 },
  );
  // Playwright fill can update the DOM before React state; a small edit guarantees input events.
  await answer.press("End");
  await answer.press(" ");
  await answer.press("Backspace");

  await saved;
  await waitForAutosaveSaved(page, 45_000);
}

/** Wait until the autosave banner shows a successful save. */
export async function waitForAutosaveSaved(page: Page, timeout = 45_000): Promise<void> {
  const status = page.getByTestId("student-autosave-status");
  await expect
    .poll(() => status.textContent(), {
      message: "autosave status should show saved",
      timeout,
    })
    .toMatch(/saved/i);
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

/**
 * Post a synthetic student heartbeat. Pass the test's `request` fixture so it still
 * goes through while the student's browser context is offline.
 */
export async function sendStudentHeartbeat(
  request: APIRequestContext,
  input: {
    liveSessionId: string;
    deviceId: string;
    displayName: string;
    pendingSyncCount?: number;
    syncState?: "synced" | "pending" | "offline";
  },
): Promise<void> {
  const res = await request.post(
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

/** Teacher clears a student's tab-leave suspension (same API as the roster "Let in" button). */
export async function teacherLetStudentIn(
  browser: Browser,
  liveSessionId: string,
  deviceId: string,
): Promise<void> {
  const teacherContext = await browser.newContext({ storageState: e2eAuthFile });
  try {
    const res = await teacherContext.request.post(
      `/api/forms/live-sessions/${liveSessionId}/resume-student`,
      { data: { deviceId } },
    );
    expect(res.ok(), `resume-student failed (${res.status()})`).toBeTruthy();
  } finally {
    await teacherContext.close();
  }
}

/** The URL the teacher's "Copy link" / QR produces (`buildStudentJoinUrl`). */
export function studentClassLink(joinCode: string): string {
  return `/en/join?code=${joinCode}&new=1&student=${crypto.randomUUID()}`;
}

/** Join through the class link / QR: the code is prefilled, only the name is typed. */
export async function joinStudentViaClassLink(
  page: Page,
  joinCode: string,
  displayName: string,
): Promise<void> {
  await page.goto(studentClassLink(joinCode));
  await page.waitForLoadState("domcontentloaded");

  const joinSection = page.locator("#join-session");
  await expect(joinSection).toBeVisible({ timeout: 30_000 });
  await expect(joinSection.getByPlaceholder("ABCD12")).toHaveValue(joinCode, { timeout: 15_000 });
  await joinSection.getByPlaceholder("e.g. Jordan Lee").fill(displayName);

  const joinButton = joinSection.getByTestId("student-join-submit");
  await expect(joinButton).toBeEnabled({ timeout: 30_000 });
  const joinResponse = waitForStudentJoin(page);
  await joinButton.click();
  await joinResponse;

  const examAnswer = page.getByTestId("student-exam-answer");
  await expect(examAnswer).toBeVisible({ timeout: 30_000 });
  await expect(examAnswer).toBeEnabled({ timeout: 30_000 });

  // Same settle rule as joinStudentSession: the hydration autosave may already be done.
  await expect
    .poll(
      async () => {
        const text = await page.getByTestId("student-autosave-status").textContent();
        return text?.match(/saved/i) != null || text?.trim() === "";
      },
      { timeout: 15_000 },
    )
    .toBe(true);
}

/** Teacher declines a device-rejoin request (the roster "Not them" button). */
export async function teacherDeclineRejoin(
  browser: Browser,
  liveSessionId: string,
  deviceId: string,
): Promise<void> {
  const teacherContext = await browser.newContext({ storageState: e2eAuthFile });
  try {
    const res = await teacherContext.request.delete(
      `/api/forms/live-sessions/${liveSessionId}/participants/${encodeURIComponent(deviceId)}/rejoin-request`,
    );
    expect(res.ok(), `decline rejoin failed (${res.status()})`).toBeTruthy();
  } finally {
    await teacherContext.close();
  }
}

export async function teacherOverviewParticipants(
  browser: Browser,
  liveSessionId: string,
): Promise<{ anonymousSessionId: string; displayName: string; rejoinRequestedAt: string | null }[]> {
  const teacherContext = await browser.newContext({ storageState: e2eAuthFile });
  try {
    const res = await teacherContext.request.get(
      `/api/forms/live-sessions/${liveSessionId}/overview`,
    );
    expect(res.ok(), `overview failed (${res.status()})`).toBeTruthy();
    const body = (await res.json()) as {
      participants: { anonymousSessionId: string; displayName: string; rejoinRequestedAt?: string | null }[];
    };
    return body.participants.map((p) => ({
      anonymousSessionId: p.anonymousSessionId,
      displayName: p.displayName,
      rejoinRequestedAt: p.rejoinRequestedAt ?? null,
    }));
  } finally {
    await teacherContext.close();
  }
}

/**
 * Report a tab leave for a student through the test's request fixture — the same
 * call the page beacons on pagehide, made deterministic for navigation-based specs.
 */
export async function studentReportTabLeave(
  request: APIRequestContext,
  input: { liveSessionId: string; deviceId: string; displayName: string },
): Promise<void> {
  const res = await request.post(`/api/public/live-sessions/${input.liveSessionId}/tab-leave`, {
    data: { deviceId: input.deviceId, displayName: input.displayName },
  });
  expect(res.ok(), `tab-leave failed (${res.status()})`).toBeTruthy();
}
