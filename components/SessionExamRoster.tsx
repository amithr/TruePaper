"use client";

import { StudentReviewShare } from "@/components/StudentReviewShare";
import { scoreTier } from "@/lib/exam-grades";
import type { StudentAnswers } from "@/lib/forms";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { useScoreCopy } from "@/lib/i18n/score-copy";
import type { LiveSessionOverviewParticipant } from "@/lib/live-session-overview";
import { liveTypingPreview } from "@/lib/live-typing-preview";
import {
  participantAvatarGradient,
  participantInitials,
} from "@/lib/participant-display";
import type { LiveParticipantUiStatus } from "@/lib/participant-status";
import { focusRing } from "@/lib/ui";

type Props = {
  liveSessionId: string;
  textQuestionIds: string[];
  participants: LiveSessionOverviewParticipant[];
  liveDraftsByDevice: Record<string, StudentAnswers>;
  onOpenExam: (deviceId: string) => void;
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
    default:
      return "tp-status tp-status-neutral";
  }
}

function RosterStatusBadge({
  participant: p,
  t,
}: {
  participant: LiveSessionOverviewParticipant;
  t: ReturnType<typeof useTranslations>;
}) {
  if (p.status === "typing") {
    return (
      <span className={statusBadgeClass("typing")}>
        <span className="tp-status-dot" aria-hidden />
        {t("session.status.typingLive")}
      </span>
    );
  }
  if (p.finishedAt && !p.gradedAt) {
    return (
      <span className={statusBadgeClass("finished")}>
        <span className="tp-status-dot" aria-hidden />
        {t("session.status.submittedPill")}
      </span>
    );
  }
  if (p.status === "graded") {
    return (
      <span className={statusBadgeClass("graded")}>
        <span className="tp-status-dot" aria-hidden />
        {t("session.status.gradedPill")}
      </span>
    );
  }
  if (p.status === "blocked") {
    return (
      <span className={statusBadgeClass("blocked")}>
        <span className="tp-status-dot" aria-hidden />
        {t("session.status.paused")}
      </span>
    );
  }
  if (p.status === "idle") {
    return (
      <span className={statusBadgeClass("idle")}>
        <span className="tp-status-dot" aria-hidden />
        {t("session.status.idle")}
      </span>
    );
  }
  return null;
}

function rosterSubtitle(
  p: LiveSessionOverviewParticipant,
  liveDraft: StudentAnswers | undefined,
  textQuestionIds: string[],
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

  const showLive =
    p.status === "typing" ||
    (liveDraft && liveTypingPreview(liveDraft, textQuestionIds).length > 0);
  if (showLive && liveDraft) {
    const preview = liveTypingPreview(liveDraft, textQuestionIds);
    if (preview) {
      return preview;
    }
  }

  if (p.textPreview) {
    return p.textPreview;
  }

  return "";
}

function RosterRow({
  liveSessionId,
  textQuestionIds,
  participant: p,
  liveDraftsByDevice,
  onOpenExam,
}: {
  liveSessionId: string;
  textQuestionIds: string[];
  participant: LiveSessionOverviewParticipant;
  liveDraftsByDevice: Record<string, StudentAnswers>;
  onOpenExam: (deviceId: string) => void;
}) {
  const t = useTranslations();
  const { scoreTierMessage } = useScoreCopy();
  const deviceNorm = p.anonymousSessionId.toLowerCase();
  const liveDraft = liveDraftsByDevice[deviceNorm];
  const initials = participantInitials(p.displayName, p.anonymousSessionId);
  const gradient = participantAvatarGradient(p.anonymousSessionId);
  const subtitle = rosterSubtitle(p, liveDraft, textQuestionIds, t, scoreTierMessage);
  const isLivePreview =
    p.status === "typing" ||
    Boolean(liveDraft && liveTypingPreview(liveDraft, textQuestionIds));

  const open = () => onOpenExam(p.anonymousSessionId);

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
                  isLivePreview && p.status === "typing" ? " tp-roster-row__preview--live" : ""
                }`}
              >
                {subtitle}
              </p>
            ) : null}
          </div>
          <RosterStatusBadge participant={p} t={t} />
        </div>
        <div
          className="tp-roster-row__actions"
          onClick={(event) => event.stopPropagation()}
        >
          <StudentReviewShare
            liveSessionId={liveSessionId}
            deviceId={p.anonymousSessionId}
            disabled={!p.displayName && p.status !== "finished" && p.status !== "graded"}
          />
          <a
            href={`/api/forms/live-sessions/${liveSessionId}/participants/${encodeURIComponent(p.anonymousSessionId)}/exam-pdf`}
            download
            className={`tp-roster-action ${focusRing}`}
            title={t("session.downloadStudentPdfTitleShort")}
          >
            {t("session.pdf")}
          </a>
        </div>
      </div>
    </div>
  );
}

export function SessionExamRoster({
  liveSessionId,
  textQuestionIds,
  participants,
  liveDraftsByDevice,
  onOpenExam,
}: Props) {
  return (
    <div className="tp-roster-list tp-roster-list--cards">
      {participants.map((p) => (
        <RosterRow
          key={p.anonymousSessionId}
          liveSessionId={liveSessionId}
          textQuestionIds={textQuestionIds}
          participant={p}
          liveDraftsByDevice={liveDraftsByDevice}
          onOpenExam={onOpenExam}
        />
      ))}
    </div>
  );
}
