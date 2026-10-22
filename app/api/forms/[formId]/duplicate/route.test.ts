import { describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/forms/[formId]/duplicate/route";

const createSupabaseServerClient = vi.fn();
const getSessionUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}));
vi.mock("@/lib/request-auth", () => ({
  getSessionUser: (...args: unknown[]) => getSessionUser(...args),
}));

const teacher = { user: { id: "t1" }, profile: { role: "teacher" } };
const call = () =>
  POST(new Request("http://localhost/api/forms/f1/duplicate", { method: "POST" }), {
    params: Promise.resolve({ formId: "f1" }),
  });

/** Minimal chainable Supabase stub: `from(table)` → query builder resolving to `results[table]`. */
function stub(results: Record<string, { data: unknown; error: null }>, inserted: Record<string, unknown[]>) {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      for (const m of ["select", "eq", "order", "delete"]) chain[m] = self;
      chain.insert = (rows: unknown) => {
        inserted[table] = Array.isArray(rows) ? rows : [rows];
        return chain;
      };
      chain.maybeSingle = () => Promise.resolve(results[`${table}.single`] ?? results[table]);
      chain.single = () => Promise.resolve(results[`${table}.inserted`]);
      chain.then = (resolve: (v: unknown) => void) =>
        resolve(inserted[table] ? results[`${table}.inserted`] : results[table]);
      return chain;
    },
  };
}

describe("POST /api/forms/[formId]/duplicate", () => {
  it("rejects non-teachers", async () => {
    getSessionUser.mockResolvedValue({ user: { id: "s1" }, profile: { role: "student" } });
    createSupabaseServerClient.mockResolvedValue({});
    expect((await call()).status).toBe(403);
  });

  it("copies the form and questions, renames it, and reports skipped images", async () => {
    getSessionUser.mockResolvedValue(teacher);
    const inserted: Record<string, unknown[]> = {};
    createSupabaseServerClient.mockResolvedValue(
      stub(
        {
          forms: {
            data: { id: "f1", title: "Unit 3 test", description: "d", description_image_path: null, live_teacher_feedback_enabled: true },
            error: null,
          },
          questions: {
            data: [
              { prompt: "Q1", prompt_image_path: "t1/f1/q.jpg", question_type: "shortAnswer", options: [], correct_answer: null, points: 2, display_order: 0, response_config: { acceptedAnswers: ["a"] } },
            ],
            error: null,
          },
          "forms.inserted": {
            data: { id: "f2", title: "Unit 3 test (copy)", description: "d", description_image_path: null, created_by: "t1", live_teacher_feedback_enabled: true },
            error: null,
          },
          "questions.inserted": {
            data: [{ id: "q2", form_id: "f2", prompt: "Q1", prompt_image_path: null, question_type: "shortAnswer", options: [], correct_answer: null, points: 2, display_order: 0, response_config: { acceptedAnswers: ["a"] } }],
            error: null,
          },
        },
        inserted,
      ),
    );
    const res = await call();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { form: { id: string; title: string; questions: unknown[] }; imagesSkipped: boolean };
    expect(body.form.title).toBe("Unit 3 test (copy)");
    expect(body.form.questions).toHaveLength(1);
    expect(body.imagesSkipped).toBe(true);
    expect((inserted.forms[0] as { title: string }).title).toBe("Unit 3 test (copy)");
    expect((inserted.questions[0] as { form_id: string }).form_id).toBe("f2");
  });
});
