"use client";

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
import type { LiveParticipantUiStatus } from "@/lib/participant-status";
import { focusRing } from "@/lib/ui";

type Props = {
  previewQuestions: RosterPreviewQuestion[];
  participants: LiveSessionOverviewParticipant[];
  liveDraftsByDevice: Record<string, StudentAnswers>;
  onOpenExam: (deviceId: string) => void;
  onResumeStudent?: (deviceId: string) => void;
  resumeBusyDeviceId?: string | null;
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

function SyncStatusBadge({
  participant: p,
  t,
}: {
  participant: LiveSessionOverviewParticipant;
  t: ReturnType<typeof useTranslations>;
}) {
  if (p.finishedAt || p.gradedAt) {
    return null;
  }
  if (p.syncState === "offline") {
    return (
      <span className="tp-status tp-status-sync-offline" data-testid="roster-sync-badge" data-sync-state="offline">
        <span className="tp-status-dot" aria-hidden />
        {t("session.status.syncOffline")}
      </span>
    );
  }
  if (p.syncState === "pending" || p.pendingSyncCount > 0) {
    return (
      <span
        className="tp-status tp-status-sync-pending"
        data-testid="roster-sync-badge"
        data-sync-state="pending"
      >
        <span className="tp-status-dot" aria-hidden />
        {t("session.status.syncSaving")}
      </span>
    );
  }
  return null;
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

function RosterRow({
  previewQuestions,
  participant: p,
  liveDraftsByDevice,
  onOpenExam,
  onResumeStudent,
  resumeBusyDeviceId,
}: {
  previewQuestions: RosterPreviewQuestion[];
  participant: LiveSessionOverviewParticipant;
  liveDraftsByDevice: Record<string, StudentAnswers>;
  onOpenExam: (deviceId: string) => void;
  onResumeStudent?: (deviceId: string) => void;
  resumeBusyDeviceId?: string | null;
}) {
  const t = useTranslations();
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
  const open = () => onOpenExam(p.anonymousSessionId);

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
              <SyncStatusBadge participant={p} t={t} />
              <RosterStatusBadge participant={p} t={t} />
            </div>
          </div>
          <button
            type="button"
            disabled={Boolean(resumeBusyDeviceId) && !isResumeBusy}
            onClick={() => onResumeStudent(p.anonymousSessionId)}
            className={`tp-btn-primary mt-3 min-h-11 w-full sm:w-auto ${focusRing}`}
          >
            {isResumeBusy ? t("common.lettingIn") : t("session.actions.letIn")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="link"
      tabIndex={0}
      className={`tp-roster-row tp-roster-row--card ${focusRing}`}
      onClick={open}
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
            <SyncStatusBadge participant={p} t={t} />
            <RosterStatusBadge participant={p} t={t} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SessionExamRoster({
  previewQuestions,
  participants,
  liveDraftsByDevice,
  onOpenExam,
  onResumeStudent,
  resumeBusyDeviceId,
}: Props) {
  return (
    <div className="tp-roster-list tp-roster-list--cards">
      {participants.map((p) => (
        <RosterRow
          key={p.anonymousSessionId}
          previewQuestions={previewQuestions}
          participant={p}
          liveDraftsByDevice={liveDraftsByDevice}
          onOpenExam={onOpenExam}
          onResumeStudent={onResumeStudent}
          resumeBusyDeviceId={resumeBusyDeviceId}
        />
      ))}
    </div>
  );
}
