"use client";

import { ChevronRight, Hand } from "lucide-react";
import { memo } from "react";

import { scoreTier } from "@/lib/exam-grades";
import type { StudentAnswers } from "@/lib/forms";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { useScoreCopy } from "@/lib/i18n/score-copy";
import type { LiveSessionOverviewParticipant } from "@/lib/live-session-overview";
import {
  liveSessionRosterPreview,
  type RosterPreviewQuestion,
} from "@/lib/live-typing-preview";
import {
  participantAvatarGradient,
  participantInitials,
} from "@/lib/participant-display";
import { HelpHint } from "@/components/HelpHint";
import { RosterWifiIcon, rosterConnectionSyncState } from "@/components/RosterWifiIcon";
import type { LiveParticipantUiStatus } from "@/lib/participant-status";
import {
  DEFAULT_ROSTER_ACTIVITY_THRESHOLDS,
  deriveRosterActivity,
  inactiveMinutes,
  type RosterActivity,
  type RosterActivityThresholds,
} from "@/lib/roster-activity";
import { focusRing } from "@/lib/ui";

type Props = {
  previewQuestions: RosterPreviewQuestion[];
  participants: LiveSessionOverviewParticipant[];
  liveDraftsByDevice: Record<string, StudentAnswers>;
  onOpenExam: (deviceId: string, questionId?: string | null) => void;
  onResumeStudent?: (deviceId: string) => void;
  resumeBusyDeviceId?: string | null;
  activityThresholds?: RosterActivityThresholds;
  sessionOpen?: boolean;
  /** Coarse (≈20s) clock so activity recomputes cheaply, not every render. */
  activityNowMs?: number;
};

function statusBadgeClass(status: LiveParticipantUiStatus): string {
  switch (status) {
    case "blocked":
      return "tp-status tp-status-blocked";
    case "finished":
      return "tp-status tp-status-finished";
    case "graded":
      return "tp-status tp-status-graded";
    case "typing":
      return "tp-status tp-status-typing";
    case "idle":
      return "tp-status tp-status-idle";
    case "started":
      return "tp-status tp-status-started";
    default:
      return "tp-status tp-status-neutral";
  }
}

function StatusChip({
  status,
  label,
}: {
  status: LiveParticipantUiStatus;
  label: string;
}) {
  return (
    <span className={statusBadgeClass(status)} data-testid="roster-status-badge" data-status={status}>
      <span className="tp-status-dot" aria-hidden />
      {label}
    </span>
  );
}

function ConnectionWifiIndicator({
  participant: p,
  t,
  nowMs,
}: {
  participant: LiveSessionOverviewParticipant;
  t: ReturnType<typeof useTranslations>;
  nowMs: number;
}) {
  if (p.finishedAt || p.gradedAt) {
    return null;
  }
  const syncState = rosterConnectionSyncState(p, nowMs);
  const label =
    syncState === "offline"
      ? t("session.status.syncOffline")
      : syncState === "pending"
        ? t("session.status.syncSaving")
        : t("session.status.syncOnline");
  return <RosterWifiIcon syncState={syncState} label={label} />;
}

function RosterStatusBadge({
  participant: p,
  t,
}: {
  participant: LiveSessionOverviewParticipant;
  t: ReturnType<typeof useTranslations>;
}) {
  if (p.finishedAt && !p.gradedAt) {
    return <StatusChip status="finished" label={t("session.status.submittedPill")} />;
  }
  if (p.gradedAt || p.status === "graded") {
    return <StatusChip status="graded" label={t("session.status.gradedPill")} />;
  }

  switch (p.status) {
    case "typing":
      return <StatusChip status="typing" label={t("session.status.typingLive")} />;
    case "blocked":
      return <StatusChip status="blocked" label={t("session.status.paused")} />;
    case "idle":
      return <StatusChip status="idle" label={t("session.status.idle")} />;
    case "started":
      return <StatusChip status="started" label={t("session.status.workingPill")} />;
    case "finished":
      return <StatusChip status="finished" label={t("session.status.submittedPill")} />;
    default:
      return <StatusChip status="idle" label={t("session.status.idle")} />;
  }
}

function rosterSubtitle(
  p: LiveSessionOverviewParticipant,
  liveDraft: StudentAnswers | undefined,
  previewQuestions: RosterPreviewQuestion[],
  t: ReturnType<typeof useTranslations>,
  scoreTierMessage: (tier: ReturnType<typeof scoreTier>) => string,
): string {
  if (
    p.status === "graded" &&
    p.pointsEarned != null &&
    p.pointsPossible != null &&
    p.pointsPossible > 0
  ) {
    const tier = scoreTier(p.pointsEarned, p.pointsPossible);
    return t("session.roster.subtitleGraded", { message: scoreTierMessage(tier) });
  }

  if (p.finishedAt && !p.gradedAt) {
    const count = p.textWordCount;
    return count === 1
      ? t("session.roster.subtitleSubmittedOne", { count })
      : t("session.roster.subtitleSubmittedOther", { count });
  }

  const draftPreview = liveDraft ? liveSessionRosterPreview(liveDraft, previewQuestions) : "";
  const showLive = p.status === "typing" || draftPreview.length > 0;
  if (showLive && draftPreview) {
    return draftPreview;
  }

  if (p.textPreview) {
    return p.textPreview;
  }

  return "";
}

function InactivityHint({ activity, t }: { activity: RosterActivity; t: ReturnType<typeof useTranslations> }) {
  if (activity.level !== "soft" && activity.level !== "strong") {
    return null;
  }
  const mins = inactiveMinutes(activity.inactiveMs);
  return (
    <span
      className="tp-roster-inactive"
      data-level={activity.level}
      data-testid="roster-inactive-hint"
      title={t("session.activity.inactiveTitle", { minutes: mins })}
    >
      {t("session.activity.inactiveLabel", { minutes: mins })}
    </span>
  );
}

const RosterRow = memo(function RosterRow({
  previewQuestions,
  participant: p,
  liveDraftsByDevice,
  onOpenExam,
  onResumeStudent,
  resumeBusyDeviceId,
  activityThresholds,
  sessionOpen,
  activityNowMs,
}: {
  previewQuestions: RosterPreviewQuestion[];
  participant: LiveSessionOverviewParticipant;
  liveDraftsByDevice: Record<string, StudentAnswers>;
  onOpenExam: (deviceId: string, questionId?: string | null) => void;
  onResumeStudent?: (deviceId: string) => void;
  resumeBusyDeviceId?: string | null;
  activityThresholds: RosterActivityThresholds;
  sessionOpen: boolean;
  activityNowMs: number;
}) {
  const t = useTranslations();
  const activity = deriveRosterActivity(p, activityThresholds, sessionOpen, activityNowMs);
  const { scoreTierMessage } = useScoreCopy();
  const deviceNorm = p.anonymousSessionId.toLowerCase();
  const liveDraft = liveDraftsByDevice[deviceNorm];
  const initials = participantInitials(p.displayName, p.anonymousSessionId);
  const gradient = participantAvatarGradient(p.anonymousSessionId);
  const draftPreview = liveDraft ? liveSessionRosterPreview(liveDraft, previewQuestions) : "";
  const subtitle = rosterSubtitle(p, liveDraft, previewQuestions, t, scoreTierMessage);
  const isLivePreview = p.status === "typing" || draftPreview.length > 0;

  const isResumeBusy = resumeBusyDeviceId === deviceNorm;
  const isBlocked = p.status === "blocked";
  const open = (questionId?: string | null) => onOpenExam(p.anonymousSessionId, questionId);
  const handRaised = Boolean(p.handRaisedAt && p.handRaiseQuestionId);

  if (isBlocked && onResumeStudent) {
    return (
      <div className="tp-roster-row tp-roster-row--card">
        <span
          className="tp-roster-avatar"
          style={{ background: gradient }}
          aria-hidden
        >
          {initials}
        </span>
        <div className="tp-roster-row__body">
          <div className="tp-roster-row__top">
            <div className="tp-roster-row__identity">
              <span className="tp-roster-row__name">
                {p.displayName || (
                  <span className="text-[var(--tp-text-muted)] italic">{t("session.roster.noName")}</span>
                )}
              </span>
            </div>
            <div className="tp-roster-row__statuses">
              <ConnectionWifiIndicator participant={p} t={t} nowMs={activityNowMs} />
              <RosterStatusBadge participant={p} t={t} />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={Boolean(resumeBusyDeviceId) && !isResumeBusy}
              onClick={() => onResumeStudent(p.anonymousSessionId)}
              className={`tp-btn-primary min-h-11 w-full sm:w-auto ${focusRing}`}
            >
              {isResumeBusy ? t("common.lettingIn") : t("session.actions.letIn")}
            </button>
            <HelpHint id="roster-suspended" text={t("help.roster.suspended")} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="link"
      tabIndex={0}
      data-activity={activity.level === "none" ? undefined : activity.level}
      className={`tp-roster-row tp-roster-row--card ${focusRing}`}
      onClick={() => open()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      }}
    >
      <span
        className="tp-roster-avatar"
        style={{ background: gradient }}
        aria-hidden
      >
        {initials}
      </span>
      <div className="tp-roster-row__body">
        <div className="tp-roster-row__top">
          <div className="tp-roster-row__identity">
            <span className="tp-roster-row__name">
              {p.displayName ? (
                p.displayName
              ) : (
                <span className="text-[var(--tp-text-muted)] italic">{t("session.roster.noName")}</span>
              )}
            </span>
            {subtitle ? (
              <p
                className={`tp-roster-row__preview${
                  isLivePreview ? " tp-roster-row__preview--live" : ""
                }`}
              >
                {subtitle}
              </p>
            ) : null}
          </div>
          <div className="tp-roster-row__statuses">
            {handRaised ? (
              <button
                type="button"
                className={`tp-roster-hand-btn ${focusRing}`}
                aria-label={t("session.roster.answerHandRaise")}
                title={t("session.roster.answerHandRaise")}
                data-testid="roster-hand-button"
                onClick={(event) => {
                  event.stopPropagation();
                  open(p.handRaiseQuestionId);
                }}
              >
                <Hand aria-hidden className="h-4 w-4" />
              </button>
            ) : null}
            {handRaised ? (
              <HelpHint id="roster-hand-raise" text={t("help.roster.handRaise")} />
            ) : null}
            <InactivityHint activity={activity} t={t} />
            <ConnectionWifiIndicator participant={p} t={t} nowMs={activityNowMs} />
            <RosterStatusBadge participant={p} t={t} />
            <ChevronRight aria-hidden className="tp-roster-row__chevron" />
          </div>
        </div>
      </div>
    </div>
  );
});

export function SessionExamRoster({
  previewQuestions,
  participants,
  liveDraftsByDevice,
  onOpenExam,
  onResumeStudent,
  resumeBusyDeviceId,
  activityThresholds = DEFAULT_ROSTER_ACTIVITY_THRESHOLDS,
  sessionOpen = true,
  activityNowMs,
}: Props) {
  // 0 keeps the heatmap inert (no flags) when no clock is supplied; the live
  // session page always passes a quantized clock. Avoids an impure Date.now()
  // in render.
  const nowMs = activityNowMs ?? 0;
  return (
    <div className="tp-roster-list tp-roster-list--cards tp-roster-list--flat">
      {participants.map((p) => (
        <RosterRow
          key={p.anonymousSessionId}
          previewQuestions={previewQuestions}
          participant={p}
          liveDraftsByDevice={liveDraftsByDevice}
          onOpenExam={onOpenExam}
          onResumeStudent={onResumeStudent}
          resumeBusyDeviceId={resumeBusyDeviceId}
          activityThresholds={activityThresholds}
          sessionOpen={sessionOpen}
          activityNowMs={nowMs}
        />
      ))}
    </div>
  );
}
