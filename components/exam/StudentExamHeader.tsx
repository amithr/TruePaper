"use client";

import { LiveCountdown } from "@/components/LiveCountdown";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import {
  getSessionDurationMinutes,
  isNoTimeLimitSession,
} from "@/lib/session-window";
import type { SyncStatus } from "@/lib/sync-status";
import { focusRing } from "@/lib/ui";

export type ExamDot = {
  id: string;
  index: number;
  answered: boolean;
};

type Props = {
  title: string;
  syncStatus: SyncStatus;
  dots: ExamDot[];
  onJump: (questionId: string) => void;
  /** ISO closesAt; omit / null hides the timer (no time limit). */
  closesAt?: string | null;
  opensAt?: string | null;
  sessionOpen: boolean;
  examFinished: boolean;
  formatCountdown: (ms: number) => string;
};

function urgencyFromFraction(fractionLeft: number): "ok" | "amber" | "red" {
  if (fractionLeft <= 0.15) {
    return "red";
  }
  if (fractionLeft <= 0.3) {
    return "amber";
  }
  return "ok";
}

/** Sticky exam chrome: title + sync, question dots, timer + time-remaining bar. */
export function StudentExamHeader({
  title,
  syncStatus,
  dots,
  onJump,
  closesAt,
  opensAt,
  sessionOpen,
  examFinished,
  formatCountdown,
}: Props) {
  const t = useTranslations();
  const sync =
    syncStatus.state === "attention"
      ? { kind: "reconnect" as const, label: t("home.exam.syncReconnect") }
      : syncStatus.state === "queued"
        ? { kind: "saving" as const, label: t("home.exam.syncSaving") }
        : { kind: "saved" as const, label: t("home.exam.syncSaved") };
  const showTimer =
    Boolean(closesAt && opensAt && sessionOpen && !examFinished) &&
    !isNoTimeLimitSession(opensAt!, closesAt!);

  const limitMin = Math.max(1, getSessionDurationMinutes(opensAt ?? "", closesAt ?? "") ?? 0);
  const totalMs =
    closesAt && opensAt
      ? Math.max(1, new Date(closesAt).getTime() - new Date(opensAt).getTime())
      : 1;

  return (
    <header className="tp-exam-header">
      <div className="tp-exam-header__inner">
        <div className="tp-exam-header__identity">
          <p className="tp-exam-header__title">{title || t("common.untitledForm")}</p>
          <p className="tp-exam-header__sync" data-kind={sync.kind}>
            <span aria-hidden className="tp-exam-header__sync-dot" />
            {sync.label}
          </p>
        </div>

        {dots.length > 0 ? (
          <div
            className="tp-exam-header__dots"
            role="navigation"
            aria-label={t("home.exam.jumpTo")}
          >
            {dots.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`tp-exam-dot ${focusRing}`}
                data-state={d.answered ? "answered" : "blank"}
                onClick={() => onJump(d.id)}
                aria-label={t("home.exam.jumpToQuestion", { n: d.index + 1 })}
              >
                {d.index + 1}
              </button>
            ))}
          </div>
        ) : null}

        <div className="tp-exam-header__timer-wrap">
          {examFinished ? (
            <span className="tp-exam-header__timer-fallback">{t("home.exam.submitted")}</span>
          ) : !sessionOpen ? (
            <span className="tp-exam-header__timer-fallback">
              {t("home.exam.sessionEnded")}
            </span>
          ) : showTimer && closesAt ? (
            <LiveCountdown
              closesAt={closesAt}
              render={(msLeft) => {
                const fraction = Math.max(0, Math.min(1, msLeft / totalMs));
                const urgency = urgencyFromFraction(fraction);
                return (
                  <div className="tp-exam-header__timer" data-urgency={urgency}>
                    <span className="tp-exam-header__timer-value">
                      {formatCountdown(Math.max(0, msLeft))}
                    </span>
                    <span className="tp-exam-header__timer-label">
                      {t("home.exam.leftOfMinutes", { n: limitMin })}
                    </span>
                  </div>
                );
              }}
            />
          ) : null}
        </div>
      </div>

      {showTimer && closesAt ? (
        <LiveCountdown
          closesAt={closesAt}
          render={(msLeft) => {
            const fraction = Math.max(0, Math.min(1, msLeft / totalMs));
            const urgency = urgencyFromFraction(fraction);
            return (
              <div
                className="tp-exam-header__timebar"
                data-urgency={urgency}
                role="progressbar"
                aria-label={t("home.exam.timeLeftAria")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(fraction * 100)}
              >
                <div
                  className="tp-exam-header__timebar-fill"
                  style={{ width: `${Math.round(fraction * 100)}%` }}
                />
              </div>
            );
          }}
        />
      ) : (
        <div className="tp-exam-header__timebar tp-exam-header__timebar--idle" aria-hidden />
      )}
    </header>
  );
}
