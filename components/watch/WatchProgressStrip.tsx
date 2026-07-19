"use client";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import { focusRing } from "@/lib/ui";

export type JumpSquareState = "empty" | "answered" | "graded";

type Props = {
  answeredCount: number;
  questionCount: number;
  pointsAwarded: number;
  pointsMax: number;
  jumps: Array<{ id: string; index: number; state: JumpSquareState }>;
  onJump: (questionId: string) => void;
};

export function WatchProgressStrip({
  answeredCount,
  questionCount,
  pointsAwarded,
  pointsMax,
  jumps,
  onJump,
}: Props) {
  const t = useTranslations();

  return (
    <div className="tp-watch-progress">
      <div className="tp-watch-progress__stats">
        <span>
          <span className="tp-watch-progress__num">
            {answeredCount}/{questionCount}
          </span>{" "}
          {t("session.watch.answeredLabel")}
        </span>
        <span className="tp-watch-progress__dot" aria-hidden>
          ·
        </span>
        <span>
          <span className="tp-watch-progress__num">
            {pointsAwarded}/{pointsMax}
          </span>{" "}
          {t("session.watch.ptsAwardedLabel")}
        </span>
      </div>
      {jumps.length > 0 ? (
        <div className="tp-watch-progress__jumps">
          <span className="tp-watch-progress__jump-label">{t("session.watch.jumpTo")}</span>
          <div className="tp-watch-progress__squares" role="navigation" aria-label={t("session.watch.jumpTo")}>
            {jumps.map((j) => (
              <button
                key={j.id}
                type="button"
                className={`tp-watch-jump ${focusRing}`}
                data-state={j.state}
                onClick={() => onJump(j.id)}
                aria-label={t("session.watch.jumpToQuestion", { n: j.index + 1 })}
              >
                {j.index + 1}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
