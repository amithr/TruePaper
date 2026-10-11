import path from "node:path";

/** Paths shared by Playwright global setup / teardown. */
export const e2eAuthDir = path.join(__dirname, ".auth");
export const e2eSessionDir = path.join(__dirname, ".session");
export const e2eAuthFile = path.join(e2eAuthDir, "teacher.json");
export const e2eFixtureFile = path.join(e2eSessionDir, "fixture.json");

/** Title / description markers used to find and purge E2E fixtures. */
export const E2E_FORM_TITLE = "E2E Live Exam";
export const E2E_FORM_DESCRIPTION = "Playwright E2E";

export function isE2eForm(form: { title?: string | null; description?: string | null }): boolean {
  const title = (form.title ?? "").trim();
  const description = (form.description ?? "").trim();
  return title === E2E_FORM_TITLE || title.startsWith(`${E2E_FORM_TITLE} `) || description === E2E_FORM_DESCRIPTION;
}
