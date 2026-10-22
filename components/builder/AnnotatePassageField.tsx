"use client";

import { ArrowDownToLine, TriangleAlert } from "lucide-react";

import {
  moveQuestionTextToPassage,
  promptLooksLikeMisplacedSource,
  withAnnotatePassage,
} from "@/lib/builder/annotate-source";
import type { Form, Question } from "@/lib/forms";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { annotatePassageText } from "@/lib/response-types/registry";
import { focusRing, ui } from "@/lib/ui";

type Props = {
  question: Question;
  updateActiveForm: (updater: (form: Form) => Form) => void;
  /** Set right after a long paste into the question text was moved into the passage. */
  pasteMoved: boolean;
  onUndoPasteMove: () => void;
};

/**
 * Always-visible source passage editor for annotate questions. It used to sit in a
 * collapsed settings panel, so teachers pasted the article into the question text —
 * which students can't highlight.
 */
export function AnnotatePassageField({
  question,
  updateActiveForm,
  pasteMoved,
  onUndoPasteMove,
}: Props) {
  const t = useTranslations();
  const passage = annotatePassageText(question.responseConfig);
  const misplaced = promptLooksLikeMisplacedSource(question);

  const replaceQuestion = (next: (q: Question) => Question) =>
    updateActiveForm((form) => ({
      ...form,
      questions: form.questions.map((q) => (q.id === question.id ? next(q) : q)),
    }));

  return (
    <div className="tp-builder-passage" data-testid="builder-annotate-passage-field">
      {misplaced ? (
        <div className="tp-builder-passage__alert" role="status">
          <TriangleAlert aria-hidden className="h-4 w-4 flex-none" />
          <span className="flex-1">{t("responseTypes.annotateSource.promptLooksLikeSource")}</span>
          <button
            type="button"
            className={`tp-btn-secondary inline-flex items-center gap-1.5 text-sm ${focusRing}`}
            onClick={() =>
              replaceQuestion((q) =>
                moveQuestionTextToPassage(q, t("responseTypes.annotateSource.defaultInstruction")),
              )
            }
          >
            <ArrowDownToLine aria-hidden className="h-4 w-4" />
            {t("responseTypes.annotateSource.moveToPassage")}
          </button>
        </div>
      ) : null}

      <label className={ui.label}>
        {t("responseTypes.annotateSource.builderPassageLabel")}
        <textarea
          rows={Math.min(14, Math.max(5, passage.split("\n").length + 2))}
          value={passage}
          onChange={(event) => replaceQuestion((q) => withAnnotatePassage(q, event.target.value))}
          placeholder={t("responseTypes.annotateSource.builderPassagePlaceholder")}
          className="tp-input"
          data-testid="builder-annotate-passage"
        />
      </label>

      {pasteMoved ? (
        <p className="tp-builder-passage__note" role="status">
          {t("responseTypes.annotateSource.pasteMoved")}{" "}
          <button type="button" className={`tp-link ${focusRing}`} onClick={onUndoPasteMove}>
            {t("responseTypes.annotateSource.undoPasteMove")}
          </button>
        </p>
      ) : passage.trim() ? (
        <p className="tp-builder-passage__note">{t("responseTypes.annotateSource.builderPassageHint")}</p>
      ) : misplaced ? null : (
        <p className="tp-builder-passage__note tp-builder-passage__note--warn" role="status">
          {t("responseTypes.annotateSource.builderPassageEmpty")}
        </p>
      )}
    </div>
  );
}
