"use client";

import type { ReactNode } from "react";

import { QuestionTypeBadge } from "@/components/response-types/QuestionTypeBadge";
import type { ResponseTypeId } from "@/lib/response-types/types";

type Props = {
  index: number;
  type: ResponseTypeId | string;
  /** Main question title / prompt shown under the meta row. */
  title?: string;
  /** Trailing meta (grade pills, overflow menu, etc.). */
  trailing?: ReactNode;
  className?: string;
};

/**
 * Shared teacher question chrome: number + type badge on one row,
 * optional prompt title below, optional trailing status/actions.
 */
export function TeacherQuestionHeader({
  index,
  type,
  title,
  trailing,
  className = "",
}: Props) {
  return (
    <div
      className={`flex flex-wrap items-start justify-between gap-2 ${className}`}
      data-testid="teacher-question-header"
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="text-sm font-semibold tabular-nums text-[var(--tp-text-secondary)]"
            data-testid="teacher-question-number"
          >
            {index + 1}
          </span>
          <QuestionTypeBadge type={type} />
        </div>
        {title ? (
          <h3 className="text-base font-semibold leading-snug text-[var(--tp-text)]">{title}</h3>
        ) : null}
      </div>
      {trailing ? <div className="flex shrink-0 flex-wrap items-center gap-2">{trailing}</div> : null}
    </div>
  );
}
