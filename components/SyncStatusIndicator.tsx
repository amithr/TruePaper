"use client";

import { useEffect, useId, useRef, useState } from "react";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import { relativeAge, type SyncStatus } from "@/lib/sync-status";
import { focusRing } from "@/lib/ui";

type Props = {
  status: SyncStatus;
  viewer: "student" | "teacher";
  /** Only meaningful in the `attention` state; renders a single "Retry" action. */
  onRetry?: () => void;
  /** Short scope label (e.g. "Your feedback") so multiple sync signals stay distinct. */
  contextLabel?: string;
  className?: string;
};

/**
 * Single ambient sync signal (student + teacher). Three calm states:
 * `synced` (near-invisible steady dot), `queued` (neutral count badge),
 * `attention` (muted amber dot). Click to expand plain-language detail. Never a
 * spinner; never alarm-red; no technical language.
 */
export function SyncStatusIndicator({
  status,
  viewer,
  onRetry,
  contextLabel,
  className = "",
}: Props) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const { state, count } = status;

  const summaryLabel =
    state === "synced"
      ? t("sync.summary.synced")
      : state === "attention"
        ? t("sync.summary.attention")
        : t("sync.summary.queued", { count });

  const breakdownParts: string[] = [];
  if (status.breakdown.responses > 0) {
    breakdownParts.push(t("sync.items.responses"));
  }
  if (status.breakdown.submission > 0) {
    breakdownParts.push(t("sync.items.submission"));
  }
  if (status.breakdown.comments > 0) {
    breakdownParts.push(
      status.breakdown.comments === 1
        ? t("sync.items.commentsOne")
        : t("sync.items.commentsOther", { count: status.breakdown.comments }),
    );
  }

  const age = relativeAge(status.oldestQueuedAt);
  const ageText =
    age.unit === "now"
      ? t("sync.age.now")
      : age.unit === "seconds"
        ? t("sync.age.seconds")
        : age.unit === "minutes"
          ? t("sync.age.minutes", { value: age.value })
          : t("sync.age.hours", { value: age.value });

  return (
    <div ref={rootRef} className={`tp-sync ${className}`} data-state={state}>
      <button
        type="button"
        className={`tp-sync__btn ${focusRing}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={contextLabel ? `${contextLabel} — ${summaryLabel}` : summaryLabel}
        data-testid="sync-status-indicator"
        data-state={state}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="tp-sync__dot" aria-hidden />
        {state !== "synced" ? (
          <span className="tp-sync__count" aria-hidden>
            {count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div id={panelId} role="status" aria-live="polite" className="tp-sync__panel">
          {contextLabel ? <p className="tp-sync__panel-eyebrow">{contextLabel}</p> : null}
          <p className="tp-sync__panel-title">{summaryLabel}</p>

          {state === "synced" ? (
            <p className="tp-sync__panel-body">{t("sync.detail.allSaved")}</p>
          ) : (
            <>
              {breakdownParts.length > 0 ? (
                <p className="tp-sync__panel-body">{breakdownParts.join(t("sync.detail.separator"))}</p>
              ) : null}
              <p className="tp-sync__panel-meta">{t("sync.detail.oldest", { age: ageText })}</p>
              {state === "attention" ? (
                onRetry ? (
                  <button
                    type="button"
                    className={`tp-sync__retry ${focusRing}`}
                    onClick={() => {
                      onRetry();
                      setOpen(false);
                    }}
                  >
                    {t("sync.detail.retry")}
                  </button>
                ) : (
                  <p className="tp-sync__panel-meta">{t("sync.detail.keepTrying")}</p>
                )
              ) : (
                <p className="tp-sync__panel-meta">
                  {viewer === "teacher"
                    ? t("sync.detail.keepSendingTeacher")
                    : t("sync.detail.keepSaving")}
                </p>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
