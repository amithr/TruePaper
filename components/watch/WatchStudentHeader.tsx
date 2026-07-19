"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import { focusRing } from "@/lib/ui";

export type WatchLiveChipState =
  | { kind: "offline"; lastSeenLabel?: string }
  | { kind: "live" }
  | { kind: "typing"; questionIndex: number }
  | { kind: "paused" }
  | { kind: "notJoined" };

type Props = {
  studentName: string;
  chip: WatchLiveChipState;
  lastActivityLabel?: string;
  studentIndex: number;
  studentCount: number;
  onPrev?: () => void;
  onNext?: () => void;
  actions?: ReactNode;
};

export function WatchStudentHeader({
  studentName,
  chip,
  lastActivityLabel,
  studentIndex,
  studentCount,
  onPrev,
  onNext,
  actions,
}: Props) {
  const t = useTranslations();

  const chipLabel =
    chip.kind === "typing"
      ? t("session.watch.liveTypingIn", { n: chip.questionIndex })
      : chip.kind === "live"
        ? t("session.watch.liveChip")
        : chip.kind === "paused"
          ? t("session.watch.pausedTab")
          : chip.kind === "notJoined"
            ? t("session.watch.notJoined")
            : chip.lastSeenLabel
              ? t("session.watch.offlineLastSeen", { time: chip.lastSeenLabel })
              : t("session.watch.offlineChip");

  return (
    <div className="tp-watch-header">
      <div className="tp-watch-header__identity">
        <h1 className="tp-watch-header__name">{studentName}</h1>
        <span
          className="tp-watch-live-chip"
          data-kind={chip.kind === "typing" ? "live" : chip.kind}
        >
          {(chip.kind === "live" || chip.kind === "typing") && (
            <span aria-hidden className="tp-watch-live-chip__dot" />
          )}
          {chipLabel}
        </span>
        {lastActivityLabel ? (
          <p className="tp-watch-header__activity">
            {t("session.watch.lastActivityShort", { time: lastActivityLabel })}
          </p>
        ) : null}
      </div>
      <div className="tp-watch-header__nav">
        <button
          type="button"
          className={`tp-watch-nav-btn ${focusRing}`}
          onClick={onPrev}
          disabled={!onPrev}
          aria-label={t("session.watch.prevStudent")}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <span className="tp-watch-header__index">
          {t("session.watch.studentOf", { i: studentIndex, n: studentCount })}
        </span>
        <button
          type="button"
          className={`tp-watch-nav-btn ${focusRing}`}
          onClick={onNext}
          disabled={!onNext}
          aria-label={t("session.watch.nextStudent")}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
        {actions}
      </div>
    </div>
  );
}
