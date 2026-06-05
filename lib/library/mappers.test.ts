import { describe, expect, it } from "vitest";

import {
  mapTemplateDetail,
  mapTemplateSummary,
  questionCountFromSnapshot,
} from "@/lib/library/mappers";
import type { TemplateSnapshot } from "@/lib/library/types";

const baseRow = {
  id: "tpl-1",
  author_id: "author-1",
  title: "Algebra basics",
  description: "Intro",
  source_kind: "form",
  scope: "mine",
  language: "en",
  subject: "math",
  grade_level: "9",
  curriculum_tags: ["algebra"],
  nmt_dpa_relevant: true,
  interaction_types: ["text"],
  current_version_number: 3,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-02-01T00:00:00.000Z",
  author_name: "Teacher",
  question_count: 5,
  cloned_at_version_number: 2,
};

describe("library mappers", () => {
  it("maps summary with updateAvailable when cloned version is older", () => {
    const summary = mapTemplateSummary(baseRow);
    expect(summary.updateAvailable).toBe(true);
    expect(summary.questionCount).toBe(5);
    expect(summary.curriculumTags).toEqual(["algebra"]);
  });

  it("omits updateAvailable when not cloned", () => {
    const summary = mapTemplateSummary({ ...baseRow, cloned_at_version_number: null });
    expect(summary.updateAvailable).toBeUndefined();
  });

  it("maps detail with snapshot and changelog", () => {
    const snapshot: TemplateSnapshot = {
      title: "Algebra basics",
      description: "Intro",
      liveTeacherFeedbackEnabled: false,
      questions: [{ id: "q1", prompt: "2+2?", type: "text", options: [], displayOrder: 0 }],
    };
    const detail = mapTemplateDetail(baseRow, snapshot, "v3");
    expect(detail.changelog).toBe("v3");
    expect(detail.snapshot).toBe(snapshot);
  });

  it("counts questions from snapshot", () => {
    const snapshot: TemplateSnapshot = {
      title: "T",
      description: "",
      liveTeacherFeedbackEnabled: false,
      questions: [
        { id: "q1", prompt: "A", type: "text", options: [], displayOrder: 0 },
        { id: "q2", prompt: "B", type: "text", options: [], displayOrder: 1 },
      ],
    };
    expect(questionCountFromSnapshot(snapshot)).toBe(2);
  });
});
