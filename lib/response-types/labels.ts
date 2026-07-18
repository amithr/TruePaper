import type { TranslationPath } from "@/lib/i18n/types";
import { getResponseTypeMeta } from "@/lib/response-types/registry";
import { normalizeResponseType, type ResponseTypeId } from "@/lib/response-types/types";

/** i18n path for a response type’s short display label (`responseTypes.*.label`). */
export function responseTypeLabelPath(type: ResponseTypeId | string): TranslationPath {
  const meta = getResponseTypeMeta(normalizeResponseType(type));
  return `responseTypes.${meta.labelKey}.label` as TranslationPath;
}
