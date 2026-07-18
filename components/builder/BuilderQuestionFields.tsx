"use client";

import { HelpHint } from "@/components/HelpHint";
import { FormAssetImageEditor } from "@/components/FormAssetImageEditor";
import { BuilderResponseConfig } from "@/components/response-types/BuilderResponseConfig";
import type { BuilderPanelKey } from "@/lib/builder/summary-tokens";
import type { Form, Question } from "@/lib/forms";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { parseResponseConfig } from "@/lib/response-types/registry";
import { ui } from "@/lib/ui";

type Props = {
  formId: string;
  question: Question;
  index: number;
  openPanel: BuilderPanelKey | null;
  isMutating: boolean;
  updateActiveForm: (updater: (form: Form) => Form) => void;
};

/** Panel bodies for builder summary tokens (image / response / scoring). */
export function BuilderQuestionFields({
  formId,
  question,
  index,
  openPanel,
  isMutating,
  updateActiveForm,
}: Props) {
  const t = useTranslations();

  if (!openPanel) {
    return null;
  }

  const panelTitle =
    openPanel === "image"
      ? t("home.builder.promptImage")
      : openPanel === "scoring"
        ? t("home.builder.scoring")
        : t("responseTypes.builder.answerSettings");

  return (
    <div className="tp-builder-card__panel" data-panel={openPanel}>
      <div className="tp-builder-card__panel-title">{panelTitle}</div>

      {openPanel === "image" ? (
        <FormAssetImageEditor
          formId={formId}
          target={question.id}
          imagePath={question.promptImagePath}
          disabled={isMutating}
          onPathChange={(path) =>
            updateActiveForm((form) => ({
              ...form,
              questions: form.questions.map((formQuestion) =>
                formQuestion.id === question.id
                  ? { ...formQuestion, promptImagePath: path }
                  : formQuestion,
              ),
            }))
          }
        />
      ) : null}

      {openPanel === "scoring" ? (
        <label className={`${ui.label} block`}>
          {t("home.builder.points")}
          <div className="mt-1.5 flex items-center gap-2">
            <input
              type="number"
              data-tour={index === 0 ? "question-points" : undefined}
              min={1}
              max={1000}
              value={question.points}
              onChange={(event) =>
                updateActiveForm((form) => ({
                  ...form,
                  questions: form.questions.map((formQuestion) =>
                    formQuestion.id === question.id
                      ? {
                          ...formQuestion,
                          points: Math.max(
                            1,
                            Math.min(1000, Number(event.target.value) || 1),
                          ),
                        }
                      : formQuestion,
                  ),
                }))
              }
              className={ui.pointsInput}
              aria-label={t("home.builder.pointsAria", { n: index + 1 })}
            />
            <span className="text-sm font-medium text-[var(--tp-text-muted)]">
              {t("home.builder.pts")}
            </span>
            {index === 0 ? (
              <HelpHint id="builder-points" text={t("help.builder.points")} />
            ) : null}
          </div>
        </label>
      ) : null}

      {openPanel === "response" ? (
        <div className="space-y-3">
          {question.type === "multipleChoice" ? (
            <div className="space-y-2">
              {question.options.map((option, optionIndex) => (
                <label
                  key={`${question.id}-option-${optionIndex}`}
                  className="block text-sm"
                >
                  {t("home.builder.optionN", { n: optionIndex + 1 })}
                  <input
                    type="text"
                    value={option}
                    onChange={(event) =>
                      updateActiveForm((form) => ({
                        ...form,
                        questions: form.questions.map((formQuestion) => {
                          if (formQuestion.id !== question.id) {
                            return formQuestion;
                          }
                          return {
                            ...formQuestion,
                            options: formQuestion.options.map((currentOption, i) =>
                              i === optionIndex ? event.target.value : currentOption,
                            ),
                            correctAnswer:
                              formQuestion.correctAnswer &&
                              formQuestion.options.some(
                                (existingOption, i) =>
                                  i !== optionIndex &&
                                  existingOption === formQuestion.correctAnswer,
                              )
                                ? formQuestion.correctAnswer
                                : formQuestion.options[optionIndex] ===
                                    formQuestion.correctAnswer
                                  ? event.target.value
                                  : formQuestion.correctAnswer,
                          };
                        }),
                      }))
                    }
                    className="tp-input"
                  />
                </label>
              ))}
              <button
                type="button"
                onClick={() =>
                  updateActiveForm((form) => ({
                    ...form,
                    questions: form.questions.map((formQuestion) => {
                      if (formQuestion.id !== question.id) {
                        return formQuestion;
                      }
                      return {
                        ...formQuestion,
                        options: [
                          ...formQuestion.options,
                          t("home.builder.optionN", {
                            n: formQuestion.options.length + 1,
                          }),
                        ],
                      };
                    }),
                  }))
                }
                className={ui.btnSecondary}
              >
                {t("home.builder.addOption")}
              </button>
              <label
                className="block text-sm font-medium"
                data-tour={index === 0 ? "correct-answer" : undefined}
              >
                <span className="inline-flex items-center gap-1">
                  {t("home.builder.correctAnswer")}
                  {index === 0 ? (
                    <HelpHint
                      id="builder-correct-answer"
                      text={t("help.builder.correctAnswer")}
                    />
                  ) : null}
                </span>
                <select
                  value={question.correctAnswer ?? ""}
                  onChange={(event) =>
                    updateActiveForm((form) => ({
                      ...form,
                      questions: form.questions.map((formQuestion) =>
                        formQuestion.id === question.id
                          ? {
                              ...formQuestion,
                              correctAnswer: event.target.value || null,
                            }
                          : formQuestion,
                      ),
                    }))
                  }
                  className="tp-input"
                >
                  <option value="">{t("home.builder.noCorrectSelected")}</option>
                  {question.options.map((option, optionIndex) => (
                    <option key={`${question.id}-correct-${optionIndex}`} value={option}>
                      {option || t("home.builder.optionN", { n: optionIndex + 1 })}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          {question.type === "extendedWritten" ||
          question.type === "text" ||
          question.type === "shortAnswer" ? (
            <>
              {question.type !== "shortAnswer" ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-sm">
                    {t("responseTypes.builder.minWords")}
                    <input
                      type="number"
                      min={0}
                      value={Number(
                        (question.responseConfig as { minWords?: number }).minWords ?? 0,
                      )}
                      onChange={(event) =>
                        updateActiveForm((form) => ({
                          ...form,
                          questions: form.questions.map((formQuestion) =>
                            formQuestion.id === question.id
                              ? {
                                  ...formQuestion,
                                  responseConfig: {
                                    ...parseResponseConfig(
                                      formQuestion.type,
                                      formQuestion.responseConfig,
                                    ),
                                    minWords: Math.max(0, Number(event.target.value) || 0),
                                  },
                                }
                              : formQuestion,
                          ),
                        }))
                      }
                      className="tp-input"
                    />
                  </label>
                  <label className="text-sm">
                    {t("responseTypes.builder.targetWords")}
                    <input
                      type="number"
                      min={0}
                      value={Number(
                        (question.responseConfig as { targetWords?: number }).targetWords ??
                          0,
                      )}
                      onChange={(event) =>
                        updateActiveForm((form) => ({
                          ...form,
                          questions: form.questions.map((formQuestion) =>
                            formQuestion.id === question.id
                              ? {
                                  ...formQuestion,
                                  responseConfig: {
                                    ...parseResponseConfig(
                                      formQuestion.type,
                                      formQuestion.responseConfig,
                                    ),
                                    targetWords: Math.max(
                                      0,
                                      Number(event.target.value) || 0,
                                    ),
                                  },
                                }
                              : formQuestion,
                          ),
                        }))
                      }
                      className="tp-input"
                    />
                  </label>
                </div>
              ) : (
                <label className="text-sm">
                  <span className="inline-flex items-center gap-1">
                    {t("responseTypes.builder.acceptedAnswers")}
                    {index === 0 ? (
                      <HelpHint
                        id="builder-accepted-answers"
                        text={t("help.builder.acceptedAnswers")}
                      />
                    ) : null}
                  </span>
                  <input
                    type="text"
                    value={(
                      (question.responseConfig as { acceptedAnswers?: string[] })
                        .acceptedAnswers ?? []
                    ).join(", ")}
                    onChange={(event) =>
                      updateActiveForm((form) => ({
                        ...form,
                        questions: form.questions.map((formQuestion) =>
                          formQuestion.id === question.id
                            ? {
                                ...formQuestion,
                                responseConfig: {
                                  ...parseResponseConfig(
                                    formQuestion.type,
                                    formQuestion.responseConfig,
                                  ),
                                  acceptedAnswers: event.target.value
                                    .split(",")
                                    .map((v) => v.trim())
                                    .filter(Boolean),
                                },
                              }
                            : formQuestion,
                        ),
                      }))
                    }
                    className="tp-input"
                    placeholder={t("responseTypes.builder.acceptedAnswersPlaceholder")}
                  />
                </label>
              )}
            </>
          ) : null}

          {question.type === "structuredMultiPart" ? (
            <div className="space-y-2">
              <p className={ui.sectionTitle}>{t("responseTypes.builder.parts")}</p>
              {(
                question.responseConfig as {
                  parts?: Array<{ id: string; label: string; prompt?: string }>;
                }
              ).parts?.map((part, partIndex) => (
                <div
                  key={`${question.id}-part-${part.id}`}
                  className="grid gap-2 sm:grid-cols-2"
                >
                  <input
                    type="text"
                    value={part.label}
                    onChange={(event) =>
                      updateActiveForm((form) => ({
                        ...form,
                        questions: form.questions.map((formQuestion) =>
                          formQuestion.id === question.id
                            ? {
                                ...formQuestion,
                                responseConfig: {
                                  ...parseResponseConfig(
                                    formQuestion.type,
                                    formQuestion.responseConfig,
                                  ),
                                  parts: (
                                    (
                                      parseResponseConfig(
                                        formQuestion.type,
                                        formQuestion.responseConfig,
                                      ) as {
                                        parts: Array<{
                                          id: string;
                                          label: string;
                                          prompt?: string;
                                        }>;
                                      }
                                    ).parts ?? []
                                  ).map((p, i) =>
                                    i === partIndex
                                      ? { ...p, label: event.target.value }
                                      : p,
                                  ),
                                },
                              }
                            : formQuestion,
                        ),
                      }))
                    }
                    className="tp-input"
                  />
                  <input
                    type="text"
                    value={part.prompt ?? ""}
                    onChange={(event) =>
                      updateActiveForm((form) => ({
                        ...form,
                        questions: form.questions.map((formQuestion) =>
                          formQuestion.id === question.id
                            ? {
                                ...formQuestion,
                                responseConfig: {
                                  ...parseResponseConfig(
                                    formQuestion.type,
                                    formQuestion.responseConfig,
                                  ),
                                  parts: (
                                    (
                                      parseResponseConfig(
                                        formQuestion.type,
                                        formQuestion.responseConfig,
                                      ) as {
                                        parts: Array<{
                                          id: string;
                                          label: string;
                                          prompt?: string;
                                        }>;
                                      }
                                    ).parts ?? []
                                  ).map((p, i) =>
                                    i === partIndex
                                      ? { ...p, prompt: event.target.value }
                                      : p,
                                  ),
                                },
                              }
                            : formQuestion,
                        ),
                      }))
                    }
                    className="tp-input"
                    placeholder={t("responseTypes.builder.partPrompt")}
                  />
                </div>
              ))}
            </div>
          ) : null}

          {question.type === "annotateSource" ? (
            <label className={ui.label}>
              {t("responseTypes.builder.sourcePassage")}
              <textarea
                rows={5}
                value={String(
                  (question.responseConfig as { passageText?: string }).passageText ?? "",
                )}
                onChange={(event) =>
                  updateActiveForm((form) => ({
                    ...form,
                    questions: form.questions.map((formQuestion) =>
                      formQuestion.id === question.id
                        ? {
                            ...formQuestion,
                            responseConfig: {
                              ...parseResponseConfig(
                                formQuestion.type,
                                formQuestion.responseConfig,
                              ),
                              passageText: event.target.value,
                            },
                          }
                        : formQuestion,
                    ),
                  }))
                }
                className="tp-input"
              />
            </label>
          ) : null}

          {question.type !== "multipleChoice" &&
          question.type !== "extendedWritten" &&
          question.type !== "text" &&
          question.type !== "shortAnswer" &&
          question.type !== "structuredMultiPart" &&
          question.type !== "annotateSource" ? (
            <>
              {index === 0 ? (
                <HelpHint
                  id="builder-response-config"
                  text={t("help.builder.responseConfig")}
                />
              ) : null}
              <BuilderResponseConfig
                question={question}
                updateActiveForm={updateActiveForm}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
