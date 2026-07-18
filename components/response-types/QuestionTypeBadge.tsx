"use client";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import { responseTypeLabelPath } from "@/lib/response-types/labels";
import type { ResponseTypeId } from "@/lib/response-types/types";

type Props = {
  type: ResponseTypeId | string;
  className?: string;
};

/** Compact teacher-facing label for a question’s response type. */
export function QuestionTypeBadge({ type, className }: Props) {
  const t = useTranslations();

  return (
    <span
      className={
        className ??
        "inline-flex w-fit items-center rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-bg-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--tp-text-secondary)]"
      }
      data-testid="question-type-badge"
    >
      {t(responseTypeLabelPath(type))}
    </span>
  );
}
