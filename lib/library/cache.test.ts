import { beforeEach, describe, expect, it } from "vitest";

import {
  cacheBrowseResult,
  cacheOwnTemplates,
  getCachedLastBrowse,
  getCachedOwnTemplates,
  getCachedRecentTemplates,
  mergeBrowseWithCache,
  touchRecentTemplate,
} from "@/lib/library/cache";
import type { LibraryBrowseResult, LibraryTemplateSummary } from "@/lib/library/types";

const template = (id: string): LibraryTemplateSummary => ({
  id,
  title: `Template ${id}`,
  description: "",
  sourceKind: "form",
  scope: "mine",
  language: "en",
  subject: "math",
  gradeLevel: "9",
  curriculumTags: [],
  nmtDpaRelevant: false,
  interactionTypes: ["text"],
  currentVersionNumber: 1,
  questionCount: 1,
  authorId: "a1",
  authorName: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("template library cache", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stores and reads own templates", () => {
    cacheOwnTemplates([template("t1"), template("t2")]);
    expect(getCachedOwnTemplates()).toHaveLength(2);
  });

  it("dedupes recent templates on touch", () => {
    touchRecentTemplate(template("t1"));
    touchRecentTemplate(template("t2"));
    touchRecentTemplate(template("t1"));
    expect(getCachedRecentTemplates().map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("mergeBrowseWithCache returns remote and caches it", () => {
    const remote: LibraryBrowseResult = {
      items: [template("remote")],
      page: 0,
      pageSize: 12,
      total: 1,
      hasMore: false,
    };
    const merged = mergeBrowseWithCache(remote, "public");
    expect(merged).toBe(remote);
    expect(getCachedLastBrowse()).toEqual(remote);
  });

  it("mergeBrowseWithCache falls back to own cache for mine scope", () => {
    cacheOwnTemplates([template("cached")]);
    const merged = mergeBrowseWithCache(null, "mine");
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0]!.id).toBe("cached");
  });
});
