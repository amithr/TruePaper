"use client";

import { ChevronRight } from "lucide-react";
import { memo, useMemo } from "react";

import type { StudentAnswers } from "@/lib/forms";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import type { LiveSessionOverviewParticipant } from "@/lib/live-session-overview";
import {
  deriveLiveRosterRow,
  type LiveRosterKind,
  type LiveRosterRowModel,
} from "@/lib/live-roster";
import type { RosterPreviewQuestion } from "@/lib/live-typing-preview";
import { participantInitials } from "@/lib/participant-display";
import {
  DEFAULT_ROSTER_ACTIVITY_THRESHOLDS,
  type RosterActivityThresholds,
} from "@/lib/roster-activity";
import { focusRing } from "@/lib/ui";

type Props = {
  previewQuestions: RosterPreviewQuestion[];
  participants: LiveSessionOverviewParticipant[];
  /** Kept for API compat; live drafts no longer drive the row subtitle. */
  liveDraftsByDevice: Record<string, StudentAnswers>;
  questionTotal: number;
  onOpenExam: (deviceId: string, questionId?: string | null) => void;
  onResumeStudent?: (deviceId: string) => void;
  resumeBusyDeviceId?: string | null;
  activityThresholds?: RosterActivityThresholds;
  sessionOpen?: boolean;
  /** Coarse (≈20s) clock so activity recomputes cheaply, not every render. */
  activityNowMs?: number;
};

function formatHandedInTime(iso: string | null): string {
  if (!iso) {
    return "";
  }
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) {
    return "";
  }
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function statusCopy(
  model: LiveRosterRowModel,
  finishedAt: string | null,
  t: ReturnType<typeof useTranslations>,
): { tone: "waiting" | "stalled" | "working" | "offline" | "done" | "help"; label: string } {
  if (model.kind === "done") {
    const time = formatHandedInTime(finishedAt);
    return {
      tone: "done",
      label: time ? t("session.roster.statusHandedInAt", { time }) : t("session.roster.statusHandedIn"),
    };
  }
  if (model.kind === "waiting") {
    return { tone: "waiting", label: t("session.roster.statusWaiting") };
  }
  if (model.offline) {
    return { tone: "offline", label: t("session.roster.statusOffline") };
  }
  if (model.kind === "help") {
    return {
      tone: "help",
      label: model.questionIndex
        ? t("session.roster.statusNeedsHelpOn", { n: model.questionIndex })
        : t("session.roster.statusNeedsHelp"),
    };
  }
  if (model.kind === "stalled") {
    return {
      tone: "stalled",
      label: model.questionIndex
        ? t("session.roster.statusIdleOn", { m: model.idleMinutes, n: model.questionIndex })
        : t("session.roster.statusIdle", { m: model.idleMinutes }),
    };
  }
  return {
    tone: "working",
    label: model.questionIndex
      ? t("session.roster.statusWorkingOn", { n: model.questionIndex })
      : t("session.roster.statusWorking"),
  };
}

function chipTone(kind: LiveRosterKind, attention: boolean, done: boolean): "attention" | "done" | "neutral" {
  if (done) {
    return "done";
  }
  if (attention) {
    return "attention";
  }
  return "neutral";
}

const RosterRow = memo(function RosterRow({
  previewQuestions,
  participant: p,
  questionTotal,
  onOpenExam,
  onResumeStudent,
  resumeBusyDeviceId,
  activityThresholds,
  sessionOpen,
  activityNowMs,
}: {
  previewQuestions: RosterPreviewQuestion[];
  participant: LiveSessionOverviewParticipant;
  questionTotal: number;
  onOpenExam: (deviceId: string, questionId?: string | null) => void;
  onResumeStudent?: (deviceId: string) => void;
  resumeBusyDeviceId?: string | null;
  activityThresholds: RosterActivityThresholds;
  sessionOpen: boolean;
  activityNowMs: number;
}) {
  const t = useTranslations();
  const deviceNorm = p.anonymousSessionId.toLowerCase();
  const initials = participantInitials(p.displayName, p.anonymousSessionId);
  const model = deriveLiveRosterRow(p, {
    previewQuestions,
    questionTotal,
    activityThresholds,
    sessionOpen,
    nowMs: activityNowMs,
  });
  const status = statusCopy(model, p.finishedAt, t);
  const isResumeBusy = resumeBusyDeviceId === deviceNorm;
  const open = (questionId?: string | null) => onOpenExam(p.anonymousSessionId, questionId);
  const progressPct =
    model.total > 0 ? Math.min(100, Math.round((model.answered / model.total) * 100)) : 0;
  const chip = chipTone(model.kind, model.attention, model.done);

  return (
    <div
      role="link"
      tabIndex={0}
      className={`tp-live-roster-row ${focusRing}`}
      data-kind={model.kind}
      data-testid="roster-row"
      onClick={() => open(model.kind === "help" ? p.handRaiseQuestionId : undefined)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open(model.kind === "help" ? p.handRaiseQuestionId : undefined);
        }
      }}
    >
      <span className="tp-live-roster-chip" data-tone={chip} aria-hidden>
        {initials}
      </span>

      <div className="tp-live-roster-identity">
        <span className="tp-live-roster-name">
          {p.displayName ? (
            p.displayName
          ) : (
            <span className="text-[var(--tp-text-muted)] italic">{t("session.roster.noName")}</span>
          )}
        </span>
        <p className="tp-live-roster-status" data-tone={status.tone} data-testid="roster-status-line">
          <span aria-hidden className="tp-live-roster-status__dot" />
          {status.label}
        </p>
      </div>

      <div
        className="tp-live-roster-progress"
        aria-label={t("session.roster.progressQuestionsAria", {
          answered: model.answered,
          total: model.total,
        })}
      >
        <div className="tp-live-roster-progress__bar" aria-hidden>
          <div
            className="tp-live-roster-progress__fill"
            data-done={model.done ? "true" : "false"}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <span className="tp-live-roster-progress__count">
          {t("session.roster.answeredShort", { a: model.answered, n: model.total })}
        </span>
      </div>

      {model.kind === "waiting" && onResumeStudent ? (
        <button
          type="button"
          className={`tp-live-roster-letin ${focusRing}`}
          disabled={Boolean(resumeBusyDeviceId) && !isResumeBusy}
          data-testid="roster-let-in"
          onClick={(event) => {
            event.stopPropagation();
            onResumeStudent(p.anonymousSessionId);
          }}
        >
          {isResumeBusy ? t("common.lettingIn") : t("session.actions.letIn")}
        </button>
      ) : null}

      <ChevronRight aria-hidden className="tp-live-roster-chevron" />
    </div>
  );
});

export function SessionExamRoster({
  previewQuestions,
  participants,
  liveDraftsByDevice: _liveDraftsByDevice,
  questionTotal,
  onOpenExam,
  onResumeStudent,
  resumeBusyDeviceId,
  activityThresholds = DEFAULT_ROSTER_ACTIVITY_THRESHOLDS,
  sessionOpen = true,
  activityNowMs,
}: Props) {
  void _liveDraftsByDevice;
  const nowMs = activityNowMs ?? 0;
  const total = questionTotal > 0 ? questionTotal : previewQuestions.length;

  const rows = useMemo(
    () =>
      participants.map((p) => (
        <RosterRow
          key={p.anonymousSessionId}
          previewQuestions={previewQuestions}
          participant={p}
          questionTotal={total}
          onOpenExam={onOpenExam}
          onResumeStudent={onResumeStudent}
          resumeBusyDeviceId={resumeBusyDeviceId}
          activityThresholds={activityThresholds}
          sessionOpen={sessionOpen}
          activityNowMs={nowMs}
        />
      )),
    [
      participants,
      previewQuestions,
      total,
      onOpenExam,
      onResumeStudent,
      resumeBusyDeviceId,
      activityThresholds,
      sessionOpen,
      nowMs,
    ],
  );

  return <div className="tp-live-roster-list">{rows}</div>;
}
