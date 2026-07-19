"use client";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import { focusRing } from "@/lib/ui";

type SaveState = "saving" | "saved" | "error" | undefined;

type Props = {
  score: number | null;
  max: number;
  disabled?: boolean;
  saveState?: SaveState;
  onChange: (next: number) => void;
};

/** − / score / max / + stepper with Full marks + autosave status. */
export function WatchScoreStepper({ score, max, disabled, saveState, onChange }: Props) {
  const t = useTranslations();
  const marked = score != null;
  const display = marked ? score : "–";

  const dec = () => {
    if (disabled) return;
    onChange(Math.max(0, (score ?? 1) - 1));
  };
  const inc = () => {
    if (disabled) return;
    onChange(Math.min(max, (score ?? -1) + 1));
  };

  return (
    <div className="tp-watch-score">
      <span className="tp-watch-score__label">{t("session.watch.score")}</span>
      <div className="tp-watch-score__stepper" role="group" aria-label={t("session.watch.quickScoreAria")}>
        <button
          type="button"
          className={`tp-watch-score__btn ${focusRing}`}
          onClick={dec}
          disabled={disabled || (marked && score <= 0)}
          aria-label={t("session.watch.scoreDecrease")}
        >
          −
        </button>
        <span className="tp-watch-score__value" aria-live="polite">
          <span className="tp-watch-score__num">{display}</span>
          <span className="tp-watch-score__sep"> / </span>
          <span className="tp-watch-score__max">{max}</span>
        </span>
        <button
          type="button"
          className={`tp-watch-score__btn ${focusRing}`}
          onClick={inc}
          disabled={disabled || (marked && score >= max)}
          aria-label={t("session.watch.scoreIncrease")}
        >
          +
        </button>
      </div>
      <button
        type="button"
        className={`tp-watch-score__full ${focusRing}`}
        onClick={() => onChange(max)}
        disabled={disabled || (marked && score === max)}
      >
        {t("session.watch.fullMarks")}
      </button>
      <span
        className="tp-watch-score__status"
        data-state={
          saveState === "saving"
            ? "saving"
            : saveState === "saved"
              ? "saved"
              : saveState === "error"
                ? "error"
                : marked
                  ? "idle"
                  : "unmarked"
        }
      >
        <span aria-hidden className="tp-watch-score__status-dot" />
        {saveState === "saving"
          ? t("common.saving")
          : saveState === "saved"
            ? t("home.builder.saved")
            : saveState === "error"
              ? t("home.builder.saveFailed")
              : marked
                ? t("home.builder.saved")
                : t("session.watch.notMarked")}
      </span>
    </div>
  );
}
