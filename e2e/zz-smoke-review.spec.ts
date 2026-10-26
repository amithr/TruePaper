// TEMPORARY — delete after use.
import { test, expect } from "@playwright/test";
import { e2eAuthFile } from "./paths";
test.use({ storageState: e2eAuthFile, viewport: { width: 1280, height: 720 } });
test("review with class", async ({ browser, page, request }) => {
  const teacher = await browser.newContext({ storageState: e2eAuthFile });
  const form = await (await teacher.request.post("/api/forms", { data: { title: "E2E Live Exam review smoke", description: "Answer **all** questions." } })).json();
  const fid = form.form.id;
  const q1 = await (await teacher.request.post("/api/forms/" + fid + "/questions", { data: { type: "multipleChoice", prompt: "Which gas do plants release?", options: ["Oxygen", "Nitrogen", "Helium"], correctAnswer: "Oxygen" } })).json();
  const q2 = await (await teacher.request.post("/api/forms/" + fid + "/questions", { data: { type: "shortAnswer", prompt: "Name the green pigment in leaves.", responseConfig: { acceptedAnswers: ["chlorophyll"], caseSensitive: false } } })).json();
  const q1id = q1.question?.id ?? q1.id; const q2id = q2.question?.id ?? q2.id;
  const session = await (await teacher.request.post("/api/forms/" + fid + "/live-sessions", { data: { noTimeLimit: true, deliveryMode: "self_paced" } })).json();
  for (const [name, dev, mc, sa] of [["Ana", "11111111-1111-4111-8111-111111111111", "Oxygen", "Chlorophyll"], ["Bo", "22222222-2222-4222-8222-222222222222", "Nitrogen", "chloroplast"], ["Cy", "33333333-3333-4333-8333-333333333333", "Oxygen", "chlorophyll"]]) {
    await request.post("/api/public/live-sessions/" + session.liveSessionId + "/register", { data: { deviceId: dev, displayName: name } });
    await request.put("/api/public/live-sessions/" + session.liveSessionId + "/responses", { data: { deviceId: dev, displayName: name, answers: { [q1id]: mc, [q2id]: sa } } });
    await request.post("/api/public/live-sessions/" + session.liveSessionId + "/finish", { data: { deviceId: dev, displayName: name } });
  }
  await page.goto("/dashboard/sessions/" + session.liveSessionId + "/review");
  await page.getByRole("button", { name: /reject non-essential/i }).click({ timeout: 5000 }).catch(() => {});
  await expect(page.getByTestId("review-title-slide")).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("review-counter")).toHaveText(/Question 1 of 2/);
  await page.screenshot({ path: "/private/tmp/claude-502/-Users-amith-Development-truepaper/fdb1874b-db8a-4109-89c7-688574f63ce8/scratchpad/shots/review-q1-blank.png" });
  await page.keyboard.press("a"); await page.keyboard.press("r");
  await expect(page.getByTestId("review-results")).toBeVisible();
  console.log("SMOKE q1", (await page.getByTestId("review-results").innerText()).replace(/\n/g, " | "));
  await page.screenshot({ path: "/private/tmp/claude-502/-Users-amith-Development-truepaper/fdb1874b-db8a-4109-89c7-688574f63ce8/scratchpad/shots/review-q1-revealed.png" });
  await page.keyboard.press("ArrowRight"); await page.keyboard.press("a");
  await expect(page.getByTestId("review-accepted-answers")).toBeVisible();
  await page.keyboard.press("r");
  console.log("SMOKE q2", (await page.getByTestId("review-results").innerText()).replace(/\n/g, " | "));
  await page.screenshot({ path: "/private/tmp/claude-502/-Users-amith-Development-truepaper/fdb1874b-db8a-4109-89c7-688574f63ce8/scratchpad/shots/review-q2.png" });
  await teacher.request.delete("/api/forms/" + fid);
  await teacher.close();
});
