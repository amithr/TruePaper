"use client";

import { useState, type KeyboardEvent } from "react";

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

/** − / typed score / max / + stepper with Full marks + autosave status. */
export function WatchScoreStepper({ score, max, disabled, saveState, onChange }: Props) {
  const t = useTranslations();
  const marked = score != null;
  // Typed value is local until blur/Enter so the per-question autosave doesn't fire per keystroke.
  const savedText = marked ? String(score) : "";
  const [draft, setDraft] = useState(savedText);
  // Adjust the draft when the saved score changes (−/+/Full marks or a refresh) — the
  // React "derive state from props" pattern, done during render rather than in an effect.
  const [syncedText, setSyncedText] = useState(savedText);
  if (syncedText !== savedText) {
    setSyncedText(savedText);
    setDraft(savedText);
  }

  const commitDraft = () => {
    const trimmed = draft.trim();
    if (trimmed === "") {
      setDraft(marked ? String(score) : "");
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setDraft(marked ? String(score) : "");
      return;
    }
    const next = Math.max(0, Math.min(max, Math.round(parsed)));
    setDraft(String(next));
    if (next !== score) {
      onChange(next);
    }
  };

  const onDraftKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      setDraft(marked ? String(score) : "");
      event.currentTarget.blur();
    }
  };

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
        <span className="tp-watch-score__value">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={max}
            step={1}
            value={draft}
            placeholder="–"
            disabled={disabled}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitDraft}
            onKeyDown={onDraftKeyDown}
            onFocus={(event) => event.currentTarget.select()}
            aria-label={t("session.watch.scoreInputAria", { max })}
            className={`tp-watch-score__input ${focusRing}`}
            data-testid="watch-score-input"
          />
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
