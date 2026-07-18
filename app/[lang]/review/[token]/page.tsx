"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { FormAssetImage } from "@/components/FormAssetImage";
import { LoadingBar } from "@/components/LoadingBar";
import { ScoreRing } from "@/components/ScoreMeter";
import { StudentTeacherFeedbackCard } from "@/components/StudentTeacherFeedbackCard";
import {
  questionScoreTone,
  scoreTier,
} from "@/lib/exam-grades";
import { deferEffect } from "@/lib/defer-effect";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { useScoreCopy } from "@/lib/i18n/score-copy";
import type { StudentReviewPayload } from "@/lib/parse-student-review";
import { hasLiveTeacherFeedbackContent } from "@/lib/live-teacher-feedback";
import { parseResponseValue } from "@/lib/response-types/answers";
import { ui } from "@/lib/ui";

export default function StudentReviewPage() {
  const t = useTranslations();
  const { scoreTierMessage } = useScoreCopy();
  const params = useParams();
  const rawToken = typeof params.token === "string" ? params.token : "";
  const [review, setReview] = useState<StudentReviewPayload | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!rawToken.trim()) {
      deferEffect(() => {
        setLoadError(t("review.errors.invalidLink"));
        setLoading(false);
      });
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/public/review/${encodeURIComponent(rawToken.trim())}`);
        const data = (await res.json()) as { review?: StudentReviewPayload; error?: string };
        if (!res.ok || !data.review) {
          throw new Error(data.error ?? t("review.errors.loadFailed"));
        }
        if (!cancelled) {
          setReview(data.review);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : t("review.errors.loadFailed"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rawToken, t]);

  const showFeedback = useMemo(
    () => review !== null && hasLiveTeacherFeedbackContent(review.liveTeacherFeedback),
    [review],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--tp-bg)] py-10">
        <main className="mx-auto max-w-3xl px-4">
          <LoadingBar className="max-w-md" label={t("loading.results")} />
        </main>
      </div>
    );
  }

  if (loadError || !review) {
    return (
      <div className="min-h-screen bg-[var(--tp-bg)] py-10">
        <main className="mx-auto max-w-3xl px-4">
          <p className="tp-alert tp-alert-error">{loadError || t("review.notFound")}</p>
        </main>
      </div>
    );
  }

  const hasScore =
    review.graded && review.pointsEarned != null && review.pointsPossible != null;
  const tier = hasScore
    ? scoreTier(review.pointsEarned as number, review.pointsPossible as number)
    : null;

  return (
    <div className="min-h-screen bg-[var(--tp-bg)] py-8 text-[var(--tp-text)] sm:py-10">
      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 sm:px-6">
        <header className="tp-card-accent p-6 sm:p-8 tp-anim-fade-up">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0 flex-1">
              <p className={ui.sectionTitle}>{t("review.headerEyebrow")}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{review.formTitle}</h1>
              {review.formDescription ? (
                <p className="mt-2 text-[var(--tp-text-secondary)]">{review.formDescription}</p>
              ) : null}
              {review.descriptionImagePath ? (
                <FormAssetImage
                  path={review.descriptionImagePath}
                  alt={t("home.exam.descriptionImageAlt")}
                  className="mt-3 overflow-hidden rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-white"
                />
              ) : null}
              {review.displayName ? (
                <p className="mt-3 text-sm text-[var(--tp-text-secondary)]">
                  {t("review.headerSubmittedAs")}{" "}
                  <span className="font-semibold text-[var(--tp-text)]">
                    {review.displayName}
                  </span>
                </p>
              ) : null}
              {hasScore ? (
                <p className="mt-4 text-base font-medium text-[var(--tp-text)]">
                  {scoreTierMessage(tier as ReturnType<typeof scoreTier>)}
                </p>
              ) : review.finished ? (
                <p className="mt-4 inline-flex items-center gap-2 text-sm text-[var(--tp-text-secondary)]">
                  <span aria-hidden className="tp-halo-dot" />
                  {t("review.headerGrading")}
                </p>
              ) : null}
            </div>
            {hasScore ? (
              <div
                className="shrink-0 tp-anim-pop"
                aria-live="polite"
              >
                <ScoreRing
                  earned={review.pointsEarned as number}
                  possible={review.pointsPossible as number}
                  size={120}
                  stroke={11}
                  animate
                />
              </div>
            ) : null}
          </div>
        </header>

        <section className="tp-card p-6">
          <div className={ui.questionList}>
            {review.questions.map((question, index) => {
              const earned = question.earnedPoints;
              const possible = question.points;
              const tone =
                typeof earned === "number" ? questionScoreTone(earned, possible) : null;
              return (
                <article key={question.id} className={ui.questionCardNested}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-semibold text-[var(--tp-text)]">
                      {index + 1}. {question.prompt || t("common.untitledQuestion")}
                    </h2>
                    {tone && typeof earned === "number" ? (
                      <span className={`tp-grade-pill tp-grade-pill--${tone}`}>
                        {t("review.points", { earned, possible })}
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--tp-text-muted)]">
                        {possible === 1
                          ? t("review.pointsPossibleOne", { n: possible })
                          : t("review.pointsPossibleOther", { n: possible })}
                      </span>
                    )}
                  </div>

                  {question.promptImagePath ? (
                    <FormAssetImage
                      path={question.promptImagePath}
                      alt={t("home.exam.promptImageAlt")}
                      className="mb-3 overflow-hidden rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-white"
                    />
                  ) : null}

                  {question.type === "multipleChoice" ? (
                    <div className="space-y-2">
                      {question.options.map((option, optionIndex) => (
                        <label
                          key={`${question.id}-${optionIndex}`}
                          className="flex cursor-default items-center gap-2 text-sm"
                        >
                          <input
                            type="radio"
                            name={question.id}
                            value={option}
                            checked={review.answers[question.id] === option}
                            disabled
                            readOnly
                          />
                          <span>{option || t("review.optionN", { n: optionIndex + 1 })}</span>
                        </label>
                      ))}
                    </div>
                  ) : question.type === "mathInput" ? (
                    <div className="space-y-3">
                      {(() => {
                        const math = parseResponseValue("mathInput", review.answers[question.id]);
                        const working =
                          math.type === "mathInput" ? math.working.trim() : "";
                        const answer =
                          math.type === "mathInput"
                            ? math.answer.trim() || (math.latex ?? "").trim()
                            : "";
                        return (
                          <>
                            <div>
                              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--tp-text-muted)]">
                                {t("responseTypes.mathInput.workingLabel")}
                              </p>
                              <textarea
                                readOnly
                                rows={4}
                                value={working}
                                placeholder={t("review.noAnswer")}
                                className="w-full resize-y rounded-md border border-[var(--tp-border-strong)] bg-[var(--tp-bg-subtle)] px-3 py-2 font-mono text-sm text-[var(--tp-text)]"
                              />
                            </div>
                            <div>
                              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--tp-text-muted)]">
                                {t("responseTypes.mathInput.answerLabel")}
                              </p>
                              <input
                                readOnly
                                value={answer}
                                placeholder={t("review.noAnswer")}
                                className="w-full rounded-md border border-[var(--tp-border-strong)] bg-[var(--tp-bg-subtle)] px-3 py-2 font-mono text-sm text-[var(--tp-text)]"
                              />
                            </div>
                          </>
                        );
                      })()}
                      {showFeedback &&
                      (review.liveTeacherFeedback[question.id] ?? "").trim().length > 0 ? (
                        <StudentTeacherFeedbackCard
                          message={review.liveTeacherFeedback[question.id] ?? ""}
                        />
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <textarea
                        readOnly
                        rows={6}
                        value={review.answers[question.id] ?? ""}
                        placeholder={t("review.noAnswer")}
                        className="w-full resize-y rounded-md border border-[var(--tp-border-strong)] bg-[var(--tp-bg-subtle)] px-3 py-2 text-sm text-[var(--tp-text)]"
                      />
                      {showFeedback &&
                      (review.liveTeacherFeedback[question.id] ?? "").trim().length > 0 ? (
                        <StudentTeacherFeedbackCard
                          message={review.liveTeacherFeedback[question.id] ?? ""}
                        />
                      ) : null}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
