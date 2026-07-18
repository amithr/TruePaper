import { getResponseTypeMeta, type ResponseTypeMeta } from "@/lib/response-types/registry";
import type { ResponseTypeId } from "@/lib/response-types/types";

export type BuilderTypeGroupId = "written" | "objective" | "visualMath";

export type BuilderTypeGroup = {
  id: BuilderTypeGroupId;
  /** i18n key under `home.builder.picker.groups.*` */
  labelKey: BuilderTypeGroupId;
  types: ResponseTypeId[];
};

/** Types that can be auto-graded when an answer key is present. */
export const AUTOGRADABLE_TYPE_IDS = new Set<ResponseTypeId>([
  "multipleChoice",
  "trueFalse",
  "shortAnswer",
  "mathInput",
  "matching",
  "ordering",
  "labelling",
]);

export function isAutogradableType(type: string): boolean {
  return AUTOGRADABLE_TYPE_IDS.has(type as ResponseTypeId);
}

/** Categorized picker order from the form-builder redesign handoff. */
export const BUILDER_TYPE_GROUPS: BuilderTypeGroup[] = [
  {
    id: "written",
    labelKey: "written",
    types: ["shortAnswer", "extendedWritten", "structuredMultiPart"],
  },
  {
    id: "objective",
    labelKey: "objective",
    types: ["multipleChoice", "trueFalse", "matching", "ordering", "labelling"],
  },
  {
    id: "visualMath",
    labelKey: "visualMath",
    types: ["mathInput", "graph", "drawDiagram", "annotateSource", "photoHandwritten"],
  },
];

export function listBuilderTypeGroups(): Array<BuilderTypeGroup & { metas: ResponseTypeMeta[] }> {
  return BUILDER_TYPE_GROUPS.map((group) => ({
    ...group,
    metas: group.types.map((id) => getResponseTypeMeta(id)),
  }));
}

export type TypeBadgeFamily = "written" | "math" | "objective" | "visual";

export function typeBadgeFamily(type: string): TypeBadgeFamily {
  if (
    type === "shortAnswer" ||
    type === "extendedWritten" ||
    type === "text" ||
    type === "structuredMultiPart" ||
    type === "annotateSource"
  ) {
    return "written";
  }
  if (type === "mathInput" || type === "graph") {
    return "math";
  }
  if (
    type === "multipleChoice" ||
    type === "trueFalse" ||
    type === "matching" ||
    type === "ordering" ||
    type === "labelling"
  ) {
    return "objective";
  }
  return "visual";
}
