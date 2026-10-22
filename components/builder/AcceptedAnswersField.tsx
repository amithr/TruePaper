"use client";

import { useId, useState } from "react";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import { ui } from "@/lib/ui";

type Props = {
  /** Re-seeds the draft when a different question is shown. */
  questionId: string;
  acceptedAnswers: string[];
  caseSensitive: boolean;
  onPatch: (patch: { acceptedAnswers?: string[]; caseSensitive?: boolean }) => void;
  /** Rendered as the field label; the help hint can be slotted in. */
  label: React.ReactNode;
};

/**
 * Split typed answers: one per line when the text has line breaks (so an answer may
 * contain a comma, e.g. "1,000"), otherwise comma-separated. Trimmed, deduplicated.
 */
export function parseAcceptedAnswers(text: string): string[] {
  const parts = text.includes("\n") ? text.split(/\r?\n/) : text.split(",");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const answer = part.trim();
    if (answer && !seen.has(answer)) {
      seen.add(answer);
      out.push(answer);
    }
  }
  return out;
}

function formatAcceptedAnswers(answers: string[]): string {
  // Answers containing commas can only round-trip as one-per-line.
  return answers.some((a) => a.includes(",")) ? answers.join("\n") : answers.join(", ");
}

/**
 * Accepted answers for auto-graded text questions. The draft stays local while the
 * teacher types (the old field re-parsed on every keystroke and erased the comma
 * they had just typed) and is normalised when they leave the field.
 */
export function AcceptedAnswersField({
  questionId,
  acceptedAnswers,
  caseSensitive,
  onPatch,
  label,
}: Props) {
  const t = useTranslations();
  const id = useId();
  const [draft, setDraft] = useState(() => formatAcceptedAnswers(acceptedAnswers));
  const [draftFor, setDraftFor] = useState(questionId);
  if (draftFor !== questionId) {
    setDraftFor(questionId);
    setDraft(formatAcceptedAnswers(acceptedAnswers));
  }

  const commit = () => {
    const next = parseAcceptedAnswers(draft);
    setDraft(formatAcceptedAnswers(next));
    const same =
      next.length === acceptedAnswers.length && next.every((a, i) => a === acceptedAnswers[i]);
    if (!same) {
      onPatch({ acceptedAnswers: next });
    }
  };

  const preview = parseAcceptedAnswers(draft);

  return (
    <div className="space-y-2" data-testid="accepted-answers-field">
      <label className={ui.label} htmlFor={id}>
        {label}
        <textarea
          id={id}
          rows={2}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          className="tp-input"
          placeholder={t("responseTypes.builder.acceptedAnswersPlaceholder")}
          spellCheck={false}
          data-testid="accepted-answers-input"
        />
      </label>
      <p className="text-xs text-[var(--tp-text-muted)]">
        {preview.length > 0
          ? t("responseTypes.builder.acceptedAnswersPreview", { list: preview.join(" · ") })
          : t("responseTypes.builder.acceptedAnswersNone")}
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!caseSensitive}
          onChange={(event) => onPatch({ caseSensitive: !event.target.checked })}
        />
        {t("responseTypes.builder.ignoreCase")}
      </label>
    </div>
  );
}
