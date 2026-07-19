"use client";

import { useMemo, useState } from "react";

import { ExamMarkdown } from "@/components/ExamMarkdown";
import { StudentExamTextarea } from "@/components/StudentExamTextarea";
import type { StructuredMultiPartConfig } from "@/lib/response-types/types";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { focusRing } from "@/lib/ui";

type Props = {
  questionId: string;
  parts: Record<string, string>;
  activePartId?: string;
  disabled: boolean;
  protect: boolean;
  config: StructuredMultiPartConfig;
  partFeedback?: Record<string, string>;
  onChange: (parts: Record<string, string>, activePartId: string) => void;
};

export function StructuredMultiPartResponder({
  questionId,
  parts,
  activePartId,
  disabled,
  protect,
  config,
  partFeedback = {},
  onChange,
}: Props) {
  const t = useTranslations();
  const partList = config.parts;
  const initialPart = activePartId && partList.some((p) => p.id === activePartId)
    ? activePartId
    : partList[0]?.id ?? "a";
  const [currentPartId, setCurrentPartId] = useState(initialPart);

  const answeredCount = useMemo(
    () => partList.filter((part) => (parts[part.id] ?? "").trim().length > 0).length,
    [partList, parts],
  );

  const currentPart = partList.find((p) => p.id === currentPartId) ?? partList[0];

  if (!currentPart) {
    return null;
  }

  const handlePartText = (text: string) => {
    onChange({ ...parts, [currentPart.id]: text }, currentPart.id);
  };

  return (
    <div className="space-y-4">
      <div
        className="flex items-center justify-between gap-2 text-xs text-[var(--tp-text-muted)]"
        role="status"
        aria-label={t("responseTypes.structured.progressAria", {
          answered: answeredCount,
          total: partList.length,
        })}
      >
        <span>
          {t("responseTypes.structured.progress", {
            answered: answeredCount,
            total: partList.length,
          })}
        </span>
        <div className="tp-exam-progress__bar max-w-[8rem] flex-1" aria-hidden>
          <div
            className="tp-exam-progress__fill"
            style={{
              width: `${partList.length === 0 ? 0 : Math.round((answeredCount / partList.length) * 100)}%`,
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("responseTypes.structured.partsAria")}>
        {partList.map((part) => {
          const answered = (parts[part.id] ?? "").trim().length > 0;
          const hasFeedback = Boolean(partFeedback[part.id]?.trim());
          return (
            <button
              key={part.id}
              type="button"
              role="tab"
              aria-selected={currentPartId === part.id}
              onClick={() => setCurrentPartId(part.id)}
              className={`min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${focusRing} ${
                currentPartId === part.id
                  ? "border-[var(--tp-accent)] bg-[var(--tp-accent-soft)] text-[var(--tp-text)]"
                  : "border-[var(--tp-border)] bg-[var(--tp-surface)] text-[var(--tp-text-secondary)]"
              }`}
            >
              {part.label}
              {answered ? <span className="ml-1 text-[var(--tp-mint)]" aria-hidden>·</span> : null}
              {hasFeedback ? <span className="ml-1 text-[var(--tp-sky)]" aria-hidden>✦</span> : null}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" aria-labelledby={`${questionId}-part-${currentPart.id}`}>
        {currentPart.prompt ? (
          <ExamMarkdown variant="body" className="mb-2 text-sm">
            {currentPart.prompt}
          </ExamMarkdown>
        ) : null}
        {partFeedback[currentPart.id]?.trim() ? (
          <div className="tp-teacher-feedback-card mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--tp-sky)]">
              {t("responseTypes.feedback.partLabel", { part: currentPart.label })}
            </p>
            <p className="mt-1 text-sm text-[var(--tp-text)]">{partFeedback[currentPart.id]}</p>
          </div>
        ) : null}
        <StudentExamTextarea
          id={`${questionId}-${currentPart.id}`}
          rows={5}
          value={parts[currentPart.id] ?? ""}
          disabled={disabled}
          protect={protect}
          onValueChange={handlePartText}
          placeholder={t("responseTypes.structured.placeholder", { part: currentPart.label })}
          className="tp-input tp-exam-textarea"
        />
      </div>
    </div>
  );
}
