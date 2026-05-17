"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { LoadingBar } from "@/components/LoadingBar";
import { StudentTeacherFeedbackCard } from "@/components/StudentTeacherFeedbackCard";
import { deferEffect } from "@/lib/defer-effect";
import type { StudentReviewPayload } from "@/lib/parse-student-review";
import { hasLiveTeacherFeedbackContent } from "@/lib/live-teacher-feedback";
import { ui } from "@/lib/ui";

export default function StudentReviewPage() {
  const params = useParams();
  const rawToken = typeof params.token === "string" ? params.token : "";
  const [review, setReview] = useState<StudentReviewPayload | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="min-h-screen bg-[var(--tp-bg)] py-8 text-[var(--tp-text)] sm:py-10">
      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 sm:px-6">
        <header>
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">Your results</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{review.formTitle}</h1>
          {review.formDescription ? (
            <p className="mt-2 text-zinc-600">{review.formDescription}</p>
          ) : null}
          {review.displayName ? (
            <p className="mt-2 text-sm text-zinc-600">
              Submitted as <span className="font-semibold text-zinc-900">{review.displayName}</span>
            </p>
          ) : null}
        </header>

        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
          This page is read-only. Your answers, point values, and teacher feedback are shown below.
        </p>

        <section className="tp-card p-6">
          <div className={ui.questionList}>
            {review.questions.map((question, index) => (
              <article key={question.id} className={ui.questionCardNested}>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-base font-semibold text-[var(--tp-text)]">
                    {index + 1}. {question.prompt || "Untitled question"}
                  </h2>
                  <span className="text-sm text-zinc-500">
                    {question.points} point{question.points === 1 ? "" : "s"}
                  </span>
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
                      className="w-full resize-y rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900"
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
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
