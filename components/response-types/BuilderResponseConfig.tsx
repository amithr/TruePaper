"use client";

import type { Form, Question } from "@/lib/forms";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { parseResponseConfig } from "@/lib/response-types/registry";
import type {
  DrawDiagramConfig,
  GraphConfig,
  LabellingConfig,
  MatchingConfig,
  MathInputConfig,
  OrderingConfig,
  TrueFalseConfig,
} from "@/lib/response-types/types";
import { ui } from "@/lib/ui";

type Props = {
  question: Question;
  updateActiveForm: (updater: (form: Form) => Form) => void;
};

export function BuilderResponseConfig({ question, updateActiveForm }: Props) {
  const t = useTranslations();

  const patchConfig = (patch: Record<string, unknown>) => {
    updateActiveForm((form) => ({
      ...form,
      questions: form.questions.map((formQuestion) =>
        formQuestion.id === question.id
          ? {
              ...formQuestion,
              responseConfig: {
                ...parseResponseConfig(formQuestion.type, formQuestion.responseConfig),
                ...patch,
              },
            }
          : formQuestion,
      ),
    }));
  };

  if (question.type === "trueFalse") {
    const config = parseResponseConfig(question.type, question.responseConfig) as TrueFalseConfig;
    return (
      <fieldset className="space-y-2">
        <legend className={ui.sectionTitle}>{t("responseTypes.builder.correctAnswer")}</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name={`tf-${question.id}`}
            checked={config.correctAnswer === true}
            onChange={() => patchConfig({ correctAnswer: true })}
          />
          {t("responseTypes.trueFalse.true")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name={`tf-${question.id}`}
            checked={config.correctAnswer === false}
            onChange={() => patchConfig({ correctAnswer: false })}
          />
          {t("responseTypes.trueFalse.false")}
        </label>
      </fieldset>
    );
  }

  if (question.type === "drawDiagram") {
    const config = parseResponseConfig(question.type, question.responseConfig) as DrawDiagramConfig;
    return (
      <div className="grid gap-3 rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-bg-subtle)] p-3 sm:grid-cols-2">
        <label className={ui.label}>
          {t("responseTypes.builder.canvasWidth")}
          <input
            type="number"
            min={320}
            max={800}
            value={config.width ?? 600}
            onChange={(event) => patchConfig({ width: Number(event.target.value) || 600 })}
            className="tp-input"
          />
        </label>
        <label className={ui.label}>
          {t("responseTypes.builder.canvasHeight")}
          <input
            type="number"
            min={200}
            max={600}
            value={config.height ?? 360}
            onChange={(event) => patchConfig({ height: Number(event.target.value) || 360 })}
            className="tp-input"
          />
        </label>
      </div>
    );
  }

  if (question.type === "graph") {
    const config = parseResponseConfig(question.type, question.responseConfig) as GraphConfig;
    return (
      <div className="space-y-3 rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-bg-subtle)] p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={ui.label}>
            {t("responseTypes.builder.graphXMin")}
            <input
              type="number"
              value={config.xMin ?? -5}
              onChange={(event) => patchConfig({ xMin: Number(event.target.value) })}
              className="tp-input"
            />
          </label>
          <label className={ui.label}>
            {t("responseTypes.builder.graphXMax")}
            <input
              type="number"
              value={config.xMax ?? 5}
              onChange={(event) => patchConfig({ xMax: Number(event.target.value) })}
              className="tp-input"
            />
          </label>
          <label className={ui.label}>
            {t("responseTypes.builder.graphYMin")}
            <input
              type="number"
              value={config.yMin ?? -5}
              onChange={(event) => patchConfig({ yMin: Number(event.target.value) })}
              className="tp-input"
            />
          </label>
          <label className={ui.label}>
            {t("responseTypes.builder.graphYMax")}
            <input
              type="number"
              value={config.yMax ?? 5}
              onChange={(event) => patchConfig({ yMax: Number(event.target.value) })}
              className="tp-input"
            />
          </label>
          <label className={ui.label}>
            {t("responseTypes.builder.canvasWidth")}
            <input
              type="number"
              min={320}
              max={640}
              value={config.width ?? 480}
              onChange={(event) => patchConfig({ width: Number(event.target.value) || 480 })}
              className="tp-input"
            />
          </label>
          <label className={ui.label}>
            {t("responseTypes.builder.canvasHeight")}
            <input
              type="number"
              min={320}
              max={640}
              value={config.height ?? 480}
              onChange={(event) => patchConfig({ height: Number(event.target.value) || 480 })}
              className="tp-input"
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={ui.label}>
            {t("responseTypes.builder.graphXAxisLabel")}
            <input
              type="text"
              value={config.xAxisLabel ?? ""}
              onChange={(event) => patchConfig({ xAxisLabel: event.target.value })}
              className="tp-input"
              placeholder={t("responseTypes.builder.graphXAxisLabelPlaceholder")}
            />
          </label>
          <label className={ui.label}>
            {t("responseTypes.builder.graphYAxisLabel")}
            <input
              type="text"
              value={config.yAxisLabel ?? ""}
              onChange={(event) => patchConfig({ yAxisLabel: event.target.value })}
              className="tp-input"
              placeholder={t("responseTypes.builder.graphYAxisLabelPlaceholder")}
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={config.showGrid !== false}
            onChange={(event) => patchConfig({ showGrid: event.target.checked })}
          />
          {t("responseTypes.builder.graphShowGrid")}
        </label>
      </div>
    );
  }

  if (question.type === "mathInput") {
    const config = parseResponseConfig(question.type, question.responseConfig) as MathInputConfig;
    return (
      <div className="space-y-3">
        <label className={ui.label}>
          {t("responseTypes.builder.acceptedAnswers")}
          <input
            type="text"
            value={(config.acceptedAnswers ?? []).join(", ")}
            onChange={(event) =>
              patchConfig({
                acceptedAnswers: event.target.value
                  .split(",")
                  .map((v) => v.trim())
                  .filter(Boolean),
              })
            }
            className="tp-input"
            placeholder={t("responseTypes.builder.acceptedAnswersPlaceholder")}
          />
        </label>
        <label className={ui.label}>
          {t("responseTypes.builder.mathPlaceholder")}
          <input
            type="text"
            value={config.placeholder ?? ""}
            onChange={(event) => patchConfig({ placeholder: event.target.value })}
            className="tp-input"
          />
        </label>
      </div>
    );
  }

  if (question.type === "matching") {
    const config = parseResponseConfig(question.type, question.responseConfig) as MatchingConfig;
    return (
      <div className="space-y-3 rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-bg-subtle)] p-3">
        <p className={ui.sectionTitle}>{t("responseTypes.builder.matchingPairs")}</p>
        {(config.left ?? []).map((left, index) => {
          const right = (config.right ?? [])[index];
          return (
            <div key={left.id} className="grid gap-2 sm:grid-cols-3">
              <input
                type="text"
                value={left.text}
                onChange={(event) => {
                  const nextLeft = [...(config.left ?? [])];
                  nextLeft[index] = { ...left, text: event.target.value };
                  patchConfig({ left: nextLeft });
                }}
                className="tp-input"
                placeholder={t("responseTypes.builder.matchLeft")}
              />
              <input
                type="text"
                value={right?.text ?? ""}
                onChange={(event) => {
                  const nextRight = [...(config.right ?? [])];
                  if (right) {
                    nextRight[index] = { ...right, text: event.target.value };
                  }
                  patchConfig({ right: nextRight });
                }}
                className="tp-input"
                placeholder={t("responseTypes.builder.matchRight")}
              />
              <span className="self-center text-xs text-[var(--tp-text-muted)]">
                {t("responseTypes.builder.autoMatched")}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  if (question.type === "ordering") {
    const config = parseResponseConfig(question.type, question.responseConfig) as OrderingConfig;
    return (
      <div className="space-y-2 rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-bg-subtle)] p-3">
        <p className={ui.sectionTitle}>{t("responseTypes.builder.orderItems")}</p>
        {(config.items ?? []).map((item, index) => (
          <input
            key={item.id}
            type="text"
            value={item.text}
            onChange={(event) => {
              const nextItems = [...(config.items ?? [])];
              nextItems[index] = { ...item, text: event.target.value };
              patchConfig({
                items: nextItems,
                correctOrder: nextItems.map((i) => i.id),
              });
            }}
            className="tp-input"
          />
        ))}
      </div>
    );
  }

  if (question.type === "labelling") {
    const config = parseResponseConfig(question.type, question.responseConfig) as LabellingConfig;
    return (
      <div className="space-y-3 rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-bg-subtle)] p-3">
        <p className={ui.sectionTitle}>{t("responseTypes.builder.labelZones")}</p>
        {(config.zones ?? []).map((zone, index) => {
          const term = (config.terms ?? [])[index];
          return (
            <div key={zone.id} className="grid gap-2 sm:grid-cols-2">
              <input
                type="text"
                value={zone.text}
                onChange={(event) => {
                  const nextZones = [...(config.zones ?? [])];
                  nextZones[index] = { ...zone, text: event.target.value };
                  patchConfig({ zones: nextZones });
                }}
                className="tp-input"
                placeholder={t("responseTypes.builder.zonePrompt")}
              />
              <input
                type="text"
                value={term?.text ?? ""}
                onChange={(event) => {
                  const nextTerms = [...(config.terms ?? [])];
                  if (term) {
                    nextTerms[index] = { ...term, text: event.target.value };
                  }
                  const correct: Record<string, string> = {};
                  (config.zones ?? []).forEach((z, i) => {
                    const tItem = nextTerms[i];
                    if (tItem) {
                      correct[z.id] = tItem.id;
                    }
                  });
                  patchConfig({ terms: nextTerms, correct });
                }}
                className="tp-input"
                placeholder={t("responseTypes.builder.correctTerm")}
              />
            </div>
          );
        })}
      </div>
    );
  }

  return null;
}
