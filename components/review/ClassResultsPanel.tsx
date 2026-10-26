"use client";

import { Check } from "lucide-react";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import type { QuestionClassStats } from "@/lib/review/class-stats";

type Props = {
  stats: QuestionClassStats;
  /** Were the stats computed over students who handed in (true) or anyone who answered? */
  finishedBased: boolean;
};

/** Anonymous aggregates for the question on screen — never a name, never one student's work. */
export function ClassResultsPanel({ stats, finishedBased }: Props) {
  const t = useTranslations();
  const basis =
    stats.n === 0
      ? t("review.present.resultsNone")
      : finishedBased
        ? t("review.present.resultsBasis", { n: stats.n })
        : t("review.present.resultsBasisDraft", { n: stats.n });

  return (
    <aside className="tp-present-results" aria-label={t("review.present.resultsTitle")} data-testid="review-results">
      <p className="tp-present-results__title">{t("review.present.resultsTitle")}</p>
      <p className="tp-present-results__basis">{basis}</p>

      {stats.kind === "choices" ? (
        <ul className="tp-present-results__bars">
          {stats.options.map((o) => (
            <li key={o.label} data-correct={o.correct ? "true" : undefined}>
              <div className="tp-present-results__bar-head">
                <span className="tp-present-results__bar-label">
                  {o.correct ? <Check aria-hidden className="h-4 w-4" /> : null}
                  {o.label}
                </span>
                <span className="tp-present-results__bar-count">
                  {o.count} · {o.pct}%
                </span>
              </div>
              <div className="tp-present-results__track">
                <div className="tp-present-results__fill" style={{ width: `${o.pct}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {stats.kind === "text" ? (
        <div className="space-y-3">
          <p className="tp-present-results__headline">
            {stats.correct !== null
              ? t("review.present.correctOfN", { correct: stats.correct, n: stats.answered })
              : t("review.present.answeredOfN", { answered: stats.answered, n: stats.n })}
          </p>
          {stats.common.length > 0 ? (
            <div>
              <p className="tp-present-results__sub">{t("review.present.commonAnswers")}</p>
              <ul className="tp-present-results__common">
                {stats.common.map((c) => (
                  <li key={c.text}>
                    <span>{c.text}</span>
                    <span className="tp-present-results__bar-count">×{c.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {stats.kind === "credit" ? (
        <div className="space-y-1">
          <p className="tp-present-results__headline">{t("review.present.avgCredit", { pct: stats.averagePct })}</p>
          <p className="tp-present-results__sub">{t("review.present.fullyCorrect", { k: stats.fullMarks, n: stats.answered })}</p>
        </div>
      ) : null}

      {stats.kind === "answered" ? (
        <p className="tp-present-results__headline">
          {t("review.present.answeredOfN", { answered: stats.answered, n: stats.n })}
        </p>
      ) : null}
    </aside>
  );
}
