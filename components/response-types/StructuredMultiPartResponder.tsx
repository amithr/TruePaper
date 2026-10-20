"use client";

import { Check } from "lucide-react";
import { useMemo } from "react";

import { ExamMarkdown } from "@/components/ExamMarkdown";
import { StudentExamTextarea } from "@/components/StudentExamTextarea";
import type { StructuredMultiPartConfig } from "@/lib/response-types/types";
import { useTranslations } from "@/lib/i18n/I18nProvider";

type Props = {
  questionId: string;
  parts: Record<string, string>;
  /** Kept for callers; every part is visible now, so nothing needs restoring. */
  activePartId?: string;
  disabled: boolean;
  protect: boolean;
  config: StructuredMultiPartConfig;
  partFeedback?: Record<string, string>;
  onChange: (parts: Record<string, string>, activePartId: string) => void;
};

/**
 * Exam-paper layout: every sub-part is listed in order (label, prompt, answer),
 * so students can read the whole question and see what's left at a glance.
 */
export function StructuredMultiPartResponder({
  questionId,
  parts,
  disabled,
  protect,
  config,
  partFeedback = {},
  onChange,
}: Props) {
  const t = useTranslations();
  const partList = config.parts;

  const answeredCount = useMemo(
    () => partList.filter((part) => (parts[part.id] ?? "").trim().length > 0).length,
    [partList, parts],
  );

  if (partList.length === 0) {
    return null;
  }

  return (
    <div className="tp-structured" data-testid="structured-parts">
      <p
        className="tp-structured__progress"
        role="status"
        aria-label={t("responseTypes.structured.progressAria", {
          answered: answeredCount,
          total: partList.length,
        })}
        data-complete={answeredCount === partList.length ? "true" : undefined}
      >
        {t("responseTypes.structured.progress", {
          answered: answeredCount,
          total: partList.length,
        })}
      </p>

      <ol className="tp-structured__list">
        {partList.map((part) => {
          const value = parts[part.id] ?? "";
          const answered = value.trim().length > 0;
          const feedback = partFeedback[part.id]?.trim();
          const fieldId = `${questionId}-${part.id}`;
          const promptId = `${fieldId}-prompt`;
          return (
            <li
              key={part.id}
              className="tp-structured__part"
              data-answered={answered ? "true" : undefined}
              data-testid={`structured-part-${part.id}`}
            >
              <span className="tp-structured__label" aria-hidden>
                {part.label}
                {answered ? (
                  <span className="tp-structured__check">
                    <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
                  </span>
                ) : null}
              </span>
              <div className="tp-structured__body">
                <div id={promptId} className="tp-structured__prompt">
                  <span className="sr-only">{part.label} </span>
                  {part.prompt ? (
                    <ExamMarkdown variant="body">{part.prompt}</ExamMarkdown>
                  ) : null}
                </div>
                {feedback ? (
                  <div className="tp-teacher-feedback-card">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--tp-sky)]">
                      {t("responseTypes.feedback.partLabel", { part: part.label })}
                    </p>
                    <p className="mt-1 text-sm text-[var(--tp-text)]">{feedback}</p>
                  </div>
                ) : null}
                {disabled && !answered ? (
                  <p className="tp-structured__empty">{t("review.noAnswer")}</p>
                ) : (
                  <label className="block" htmlFor={fieldId}>
                    <span className="sr-only">
                      {t("responseTypes.structured.answerFor", { part: part.label })}
                    </span>
                    <StudentExamTextarea
                      id={fieldId}
                      rows={2}
                      autoGrow
                      ariaDescribedBy={part.prompt ? promptId : undefined}
                      value={value}
                      disabled={disabled}
                      protect={protect}
                      onValueChange={(text) => onChange({ ...parts, [part.id]: text }, part.id)}
                      placeholder={disabled ? undefined : t("responseTypes.structured.placeholder")}
                      className="tp-input tp-exam-textarea tp-structured__answer"
                    />
                  </label>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
