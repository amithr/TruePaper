"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Confetti } from "@/components/Confetti";
import { LoadingBar } from "@/components/LoadingBar";
import { ScoreRing } from "@/components/ScoreMeter";
import { StudentTeacherFeedbackCard } from "@/components/StudentTeacherFeedbackCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  questionScoreTone,
  scoreTier,
  scoreTierMessage,
} from "@/lib/exam-grades";
import { deferEffect } from "@/lib/defer-effect";
import type { StudentReviewPayload } from "@/lib/parse-student-review";
import { hasLiveTeacherFeedbackContent } from "@/lib/live-teacher-feedback";
import { ui } from "@/lib/ui";

const CONFETTI_KEY = "truepaper_review_confetti_seen";

export default function StudentReviewPage() {
  const params = useParams();
  const rawToken = typeof params.token === "string" ? params.token : "";
  const [review, setReview] = useState<StudentReviewPayload | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiFiredRef = useRef(false);

  useEffect(() => {
    if (!rawToken.trim()) {
      deferEffect(() => {
        setLoadError("Invalid review link.");
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
          throw new Error(data.error ?? "Could not load your results.");
        }
        if (!cancelled) {
          setReview(data.review);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Could not load your results.");
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
  }, [rawToken]);

  // Fire a single confetti burst the first time a graded result is revealed
  // (per token, per browser). Skipped for partial/zero scores and replays.
  useEffect(() => {
    if (!review || confettiFiredRef.current) {
      return;
    }
    if (!review.graded || review.pointsEarned == null || review.pointsPossible == null) {
      return;
    }
    const tier = scoreTier(review.pointsEarned, review.pointsPossible);
    if (tier !== "perfect" && tier !== "great") {
      return;
    }
    try {
      const key = `${CONFETTI_KEY}:${rawToken.trim().toUpperCase()}`;
      if (typeof window !== "undefined" && window.sessionStorage.getItem(key) === "1") {
        return;
      }
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(key, "1");
      }
    } catch {
      /* ignore storage failures */
    }
    confettiFiredRef.current = true;
    deferEffect(() => setShowConfetti(true));
    const id = window.setTimeout(() => {
      deferEffect(() => setShowConfetti(false));
    }, 2200);
    return () => window.clearTimeout(id);
  }, [review, rawToken]);

  const showFeedback = useMemo(
    () => review !== null && hasLiveTeacherFeedbackContent(review.liveTeacherFeedback),
    [review],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--tp-bg)] py-10">
        <main className="mx-auto max-w-3xl px-4">
          <LoadingBar className="max-w-md" label="Loading your results" />
        </main>
      </div>
    );
  }

  if (loadError || !review) {
    return (
      <div className="min-h-screen bg-[var(--tp-bg)] py-10">
        <main className="mx-auto max-w-3xl px-4">
          <p className="tp-alert tp-alert-error">{loadError || "Results not found."}</p>
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
    <div className="relative min-h-screen bg-[var(--tp-bg)] py-8 text-[var(--tp-text)] sm:py-10">
      {showConfetti ? <Confetti /> : null}
      <div className="pointer-events-none fixed right-4 top-4 z-50 sm:right-6 sm:top-6">
        <div className="pointer-events-auto">
          <ThemeToggle />
        </div>
      </div>
      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 sm:px-6">
        <header className="tp-card-accent p-6 sm:p-8 tp-anim-fade-up">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0 flex-1">
              <p className={ui.sectionTitle}>Your results</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">{review.formTitle}</h1>
              {review.formDescription ? (
                <p className="mt-2 text-[var(--tp-text-secondary)]">{review.formDescription}</p>
              ) : null}
              {review.displayName ? (
                <p className="mt-3 text-sm text-[var(--tp-text-secondary)]">
                  Submitted as{" "}
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
                  Your teacher is grading your exam.
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
                      {index + 1}. {question.prompt || "Untitled question"}
                    </h2>
                    {tone ? (
                      <span className={`tp-grade-pill tp-grade-pill--${tone}`}>
                        {earned} / {possible} pt{possible === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--tp-text-muted)]">
                        {possible} point{possible === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>

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
                          <span>{option || `Option ${optionIndex + 1}`}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <textarea
                        readOnly
                        rows={6}
                        value={review.answers[question.id] ?? ""}
                        placeholder="No answer submitted."
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
