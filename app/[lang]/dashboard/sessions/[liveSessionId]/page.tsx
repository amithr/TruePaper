"use client";

import { useParams } from "next/navigation";

import { useLocaleRouter as useRouter } from "@/lib/i18n/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ConfirmButton } from "@/components/ConfirmButton";
import { HelpHint } from "@/components/HelpHint";
import { LoadingBar } from "@/components/LoadingBar";
import { SaveTemplateModal } from "@/components/library/SaveTemplateModal";
import { OverflowMenu, type OverflowMenuItem } from "@/components/OverflowMenu";
import { RosterActivityThresholds } from "@/components/RosterActivityThresholds";
import { RosterSyncSummary } from "@/components/RosterSyncSummary";
import { SessionExamRoster } from "@/components/SessionExamRoster";
import { SessionJoinShare } from "@/components/SessionJoinShare";
import { SyncStatusIndicator } from "@/components/SyncStatusIndicator";
import { TeacherTopBar } from "@/components/TeacherTopBar";
import { useFeedbackSyncStatus } from "@/lib/offline/use-feedback-sync-status";
import {
  countNeedsGrading,
  compareRosterParticipants,
  matchesFilter,
  type GradingRosterFilter,
} from "@/lib/grading-roster";
import type { LiveSessionOverviewPayload } from "@/lib/live-session-overview";
import { isNoTimeLimitSession } from "@/lib/session-window";
import { deferEffect } from "@/lib/defer-effect";
import { notifyStudentExamResumed } from "@/lib/notify-student-exam-resumed";
import { ROSTER_ACTIVITY_TICK_MS } from "@/lib/roster-activity";
import { useCoalescedCallback } from "@/lib/use-coalesced-callback";
import { useRosterActivityThresholds } from "@/lib/use-roster-activity-thresholds";
import { useLiveSessionAnswerDrafts } from "@/lib/use-live-session-answer-drafts";
import { useLiveSessionOverviewRefresh } from "@/lib/use-live-session-overview-refresh";
import { usePollingRefresh } from "@/lib/use-polling-refresh";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { ui } from "@/lib/ui";

import { messageForBackgroundRefreshError } from "@/lib/background-network-error";
import { requestJson } from "@/lib/request-json";

/** Floor between teacher overview refetches; collapses poll + realtime bursts. */
const OVERVIEW_MIN_REFRESH_MS = 1200;

function formatCountdown(ms: number): string {
  if (ms <= 0) {
    return "0:00";
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function LiveSessionDetailPage() {
  const t = useTranslations();
  const router = useRouter();
  const params = useParams();
  const liveSessionId = typeof params.liveSessionId === "string" ? params.liveSessionId : "";

  const [overview, setOverview] = useState<LiveSessionOverviewPayload | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  // serverNow − local clock at fetch time, so presence staleness is judged on the
  // same (server) clock as last_seen_at, immune to teacher-device clock skew.
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);
  const overviewEtagRef = useRef<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [sessionActionBusy, setSessionActionBusy] = useState(false);
  const [participantBusyDeviceId, setParticipantBusyDeviceId] = useState<string | null>(null);
  const [rosterFilter, setRosterFilter] = useState<GradingRosterFilter>("all");
  const [filterInitialized, setFilterInitialized] = useState(false);

  const feedbackSync = useFeedbackSyncStatus({
    liveSessionId: liveSessionId || null,
    enabled: Boolean(liveSessionId),
  });
  const [activityThresholds, setActivityThresholds] = useRosterActivityThresholds(liveSessionId);

  const liveDraftsByDevice = useLiveSessionAnswerDrafts(
    Boolean(overview?.session.sessionOpen),
    liveSessionId,
  );

  const applyServerClock = useCallback((serverNowHeader: string | null) => {
    if (!serverNowHeader) {
      return;
    }
    const serverNowMs = Date.parse(serverNowHeader);
    if (Number.isFinite(serverNowMs)) {
      setServerClockOffsetMs(serverNowMs - Date.now());
    }
  }, []);

  // The actual network fetch. Sends If-None-Match so the server can answer 304
  // (nothing changed) cheaply; on 304 we keep current state and skip re-rendering.
  const performOverviewFetch = useCallback(async () => {
    if (!liveSessionId) {
      return;
    }
    setLoadError("");
    try {
      const headers: Record<string, string> = {};
      if (overviewEtagRef.current) {
        headers["If-None-Match"] = overviewEtagRef.current;
      }
      const response = await fetch(`/api/forms/live-sessions/${liveSessionId}/overview`, {
        headers,
        cache: "no-store",
      });
      applyServerClock(response.headers.get("x-server-now"));

      if (response.status === 304) {
        return;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        const snippet = (await response.text()).trim().slice(0, 80);
        throw new Error(
          response.status === 404
            ? "API route not found (server returned HTML). Restart `npm run dev` from the truepaper project folder."
            : `Expected JSON but got ${response.status} (${contentType || "unknown type"}). ${snippet}`,
        );
      }

      const data = (await response.json()) as LiveSessionOverviewPayload & { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Request failed.");
      }

      const etag = response.headers.get("etag");
      if (etag) {
        overviewEtagRef.current = etag;
      }
      setOverview(data);
      if (!filterInitialized) {
        const needs = countNeedsGrading(data.participants);
        if (needs > 0) {
          setRosterFilter("needs-grading");
        }
        setFilterInitialized(true);
      }
    } catch (e) {
      const message = messageForBackgroundRefreshError(e, t("session.errors.loadSession"));
      if (message) {
        setLoadError(message);
      }
    }
  }, [applyServerClock, filterInitialized, liveSessionId, t]);

  // Coalesce the two refresh sources (3s poll + realtime broadcast) into at most
  // one fetch per OVERVIEW_MIN_REFRESH_MS, with no concurrent runs.
  const refreshOverview = useCoalescedCallback(performOverviewFetch, OVERVIEW_MIN_REFRESH_MS);

  useEffect(() => {
    if (!liveSessionId) {
      return;
    }
    deferEffect(() => {
      refreshOverview();
    });
  }, [liveSessionId, refreshOverview]);

  usePollingRefresh({
    enabled: Boolean(overview?.session.sessionOpen),
    intervalMs: 3000,
    immediate: false,
    onRefresh: refreshOverview,
  });

  useLiveSessionOverviewRefresh(
    Boolean(overview?.session.sessionOpen),
    liveSessionId,
    refreshOverview,
  );

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const stopSession = async () => {
    if (!liveSessionId) {
      return;
    }
    setSessionActionBusy(true);
    setLoadError("");
    try {
      await requestJson<{ ok: true }>(`/api/forms/live-sessions/${liveSessionId}/stop`, {
        method: "POST",
      });
      router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t("session.errors.stop"));
    } finally {
      setSessionActionBusy(false);
    }
  };

  const deleteSession = async () => {
    if (!liveSessionId) {
      return;
    }
    setSessionActionBusy(true);
    setLoadError("");
    try {
      await requestJson<{ ok: true }>(`/api/forms/live-sessions/${liveSessionId}`, {
        method: "DELETE",
      });
      router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t("session.errors.delete"));
    } finally {
      setSessionActionBusy(false);
    }
  };

  const resumeStudent = useCallback(
    async (deviceId: string) => {
      if (!liveSessionId) {
        return;
      }
      const deviceIdNorm = deviceId.toLowerCase();
      setParticipantBusyDeviceId(deviceIdNorm);
      setLoadError("");
      try {
        await requestJson<{ ok: true }>(`/api/forms/live-sessions/${liveSessionId}/resume-student`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: deviceIdNorm }),
        });
        void notifyStudentExamResumed(liveSessionId, deviceId);
        refreshOverview();
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : t("session.errors.resume"));
      } finally {
        setParticipantBusyDeviceId(null);
      }
    },
    [liveSessionId, refreshOverview, t],
  );

  // Stable handlers + memoized lists so RosterRow (React.memo) doesn't re-render on
  // the 1s countdown tick — only on real data / heatmap-bucket changes.
  const handleOpenExam = useCallback(
    (deviceId: string, questionId?: string | null) => {
      const baseUrl = `/dashboard/sessions/${liveSessionId}/watch/${encodeURIComponent(deviceId)}`;
      router.push(questionId ? `${baseUrl}?question=${encodeURIComponent(questionId)}` : baseUrl);
    },
    [liveSessionId, router],
  );

  const handleResumeStudent = useCallback(
    (deviceId: string) => {
      void resumeStudent(deviceId);
    },
    [resumeStudent],
  );

  const rosterPreviewQuestions = useMemo(() => {
    const sess = overview?.session;
    if (!sess) {
      return [];
    }
    return sess.previewQuestions ?? sess.textQuestionIds.map((id) => ({ id, type: "text" }));
  }, [overview?.session]);

  const displayedParticipants = useMemo(() => {
    const list = overview?.participants;
    if (!list) {
      return [];
    }
    return [...list]
      .filter((p) => matchesFilter(p, rosterFilter))
      .sort((a, b) => {
        const byHand = compareRosterParticipants(a, b);
        if (byHand !== 0) {
          return byHand;
        }
        return (a.displayName || "").localeCompare(b.displayName || "");
      });
  }, [overview?.participants, rosterFilter]);

  if (!overview) {
    return (
      <div className={ui.page}>
        <main className={`${ui.pageMain} space-y-6`}>
          <TeacherTopBar />
          <div>
            <Breadcrumbs
              items={[
                { label: t("nav.dashboard"), href: "/dashboard" },
                { label: t("nav.liveSession") },
              ]}
            />
            {loadError ? (
              <p className="mt-6 tp-alert tp-alert-error">
                {loadError}
              </p>
            ) : (
              <LoadingBar className="mt-6 max-w-md" label={t("loading.session")} />
            )}
          </div>
        </main>
      </div>
    );
  }

  const s = overview.session;
  const msLeft = new Date(s.closesAt).getTime() - nowTick;
  const sessionRunning = s.sessionOpen;
  // Quantize the 1s countdown tick to a ~20s cadence for the activity heatmap so
  // it recomputes cheaply rather than every second.
  const activityNowMs =
    Math.floor((nowTick + serverClockOffsetMs) / ROSTER_ACTIVITY_TICK_MS) *
    ROSTER_ACTIVITY_TICK_MS;
  const noTimeLimit = isNoTimeLimitSession(s.opensAt, s.closesAt);
  const needsGradingCount = countNeedsGrading(overview.participants);

  const totalCount = overview.participants.length;
  let gradedCount = 0;
  let workingCount = 0;
  for (const p of overview.participants) {
    if (p.gradedAt || p.status === "graded") {
      gradedCount += 1;
    } else if (p.finishedAt) {
      // counted in needsGradingCount
    } else if (p.status !== "blocked") {
      workingCount += 1;
    }
  }
  const timeLeftValue = !sessionRunning
    ? t("session.stats.closed")
    : noTimeLimit
      ? t("session.stats.noLimit")
      : formatCountdown(msLeft);

  const sessionOverflowItems: OverflowMenuItem[] = [
    {
      type: "link",
      label: t("session.downloadAllPdf"),
      href: `/api/forms/live-sessions/${liveSessionId}/exam-bundle-pdf`,
      download: true,
    },
    {
      type: "button",
      label: t("common.refresh"),
      onClick: () => void refreshOverview(),
    },
    {
      type: "button",
      label: t("templateLibrary.save.action"),
      onClick: () => setSaveTemplateOpen(true),
    },
    {
      type: "custom",
      key: "session-action",
      node: sessionRunning ? (
        <span className="flex w-full items-center gap-2">
          <ConfirmButton
            tone="danger"
            label={t("session.actions.stop")}
            confirmLabel={t("common.tapAgainStop")}
            busy={sessionActionBusy}
            busyLabel={t("common.stopping")}
            onConfirm={stopSession}
            className="w-full justify-start px-3 py-2.5 text-sm"
          />
          <HelpHint id="session-stop" text={t("help.session.stop")} />
        </span>
      ) : (
        <ConfirmButton
          tone="danger"
          label={t("session.actions.delete")}
          confirmLabel={t("common.tapAgainDelete")}
          busy={sessionActionBusy}
          busyLabel={t("common.deleting")}
          onConfirm={deleteSession}
          className="w-full justify-start px-3 py-2.5 text-sm"
        />
      ),
    },
  ];

  return (
    <div className={ui.page}>
      <main className={`${ui.pageMain} space-y-6`}>
        <TeacherTopBar />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <Breadcrumbs
              items={[
                { label: t("nav.dashboard"), href: "/dashboard" },
                { label: s.formTitle },
              ]}
            />
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">{s.formTitle}</h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-[var(--tp-text-secondary)]">
              <span
                className={`tp-status ${sessionRunning ? "tp-status-started" : "tp-status-neutral"}`}
              >
                <span className="tp-status-dot" aria-hidden />
                {sessionRunning ? t("session.statusLive") : t("session.windowClosed")}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SyncStatusIndicator
              status={feedbackSync.status}
              viewer="teacher"
              contextLabel={t("sync.context.yourFeedback")}
              onRetry={() => void feedbackSync.retry()}
            />
            {sessionRunning ? (
              <a
                href={`/live/${encodeURIComponent(s.joinCode)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={ui.btnSecondary}
              >
                <svg
                  aria-hidden
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <path d="M8 21h8M12 17v4" />
                </svg>
                {t("session.openClassDisplayBtn")}
              </a>
            ) : null}
            <OverflowMenu label={t("session.moreActions")} items={sessionOverflowItems} />
          </div>
        </div>

        {loadError ? (
          <p className="tp-alert tp-alert-error">
            {loadError}
          </p>
        ) : null}

        <section className="tp-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="tp-stat-label">{t("session.joinCodeLabel")}</p>
              <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.2em] text-[var(--tp-text)]">
                {s.joinCode}
              </p>
              <SessionJoinShare joinCode={s.joinCode} className="mt-3" />
            </div>
            <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 sm:justify-items-end">
              <div>
                <dd className="tp-stat-value">{totalCount}</dd>
                <dt className="tp-stat-label">{t("session.stats.joined")}</dt>
              </div>
              <div>
                <dd className="tp-stat-value">{workingCount}</dd>
                <dt className="tp-stat-label">{t("session.stats.working")}</dt>
              </div>
              <div>
                <dd className="tp-stat-value">{needsGradingCount}</dd>
                <dt className="tp-stat-label">{t("session.stats.submitted")}</dt>
              </div>
              <div>
                <dd className="tp-stat-value">{gradedCount}</dd>
                <dt className="tp-stat-label">{t("session.stats.graded")}</dt>
              </div>
              <div className="col-span-2 sm:col-span-4 sm:text-right">
                <dd className="tp-stat-value tabular-nums">{timeLeftValue}</dd>
                <dt className="tp-stat-label">{t("session.stats.timeLeft")}</dt>
              </div>
            </dl>
          </div>
        </section>

        <section className="tp-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="flex items-center gap-1.5 text-lg font-semibold">
                {t("session.roster.title")}
                <HelpHint id="roster-presence" text={t("help.roster.presence")} />
              </h2>
              <RosterSyncSummary participants={overview.participants} nowMs={activityNowMs} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {sessionRunning ? (
                <RosterActivityThresholds
                  thresholds={activityThresholds}
                  onChange={setActivityThresholds}
                />
              ) : null}
              {overview.participants.length > 0 ? (
                <div
                  role="group"
                  aria-label={t("session.roster.filterAria")}
                  className="tp-filter-bar"
                >
                  <button
                    type="button"
                    className="tp-filter-chip"
                    aria-pressed={rosterFilter === "all"}
                    onClick={() => setRosterFilter("all")}
                  >
                    {t("session.roster.all")}
                  </button>
                  <button
                    type="button"
                    className="tp-filter-chip"
                    aria-pressed={rosterFilter === "needs-grading"}
                    onClick={() => setRosterFilter("needs-grading")}
                  >
                    {t("session.roster.needsGrading")}
                    {needsGradingCount > 0 ? (
                      <span className="tp-filter-count">{needsGradingCount}</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="tp-filter-chip"
                    aria-pressed={rosterFilter === "graded"}
                    onClick={() => setRosterFilter("graded")}
                  >
                    {t("session.roster.graded")}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          {overview.participants.length === 0 ? (
            <p className="mt-4 tp-empty">
              {t("session.roster.emptyDevices")}
            </p>
          ) : displayedParticipants.length === 0 ? (
            <p className="mt-4 tp-empty">
              {rosterFilter === "needs-grading"
                ? t("session.roster.emptyNeedsGrading")
                : rosterFilter === "graded"
                  ? t("session.roster.emptyGraded")
                  : t("session.roster.emptyFilter")}
            </p>
          ) : (
            <div className="mt-4">
              <SessionExamRoster
                previewQuestions={rosterPreviewQuestions}
                liveDraftsByDevice={liveDraftsByDevice}
                participants={displayedParticipants}
                onOpenExam={handleOpenExam}
                onResumeStudent={handleResumeStudent}
                resumeBusyDeviceId={participantBusyDeviceId}
                activityThresholds={activityThresholds}
                sessionOpen={sessionRunning}
                activityNowMs={activityNowMs}
              />
            </div>
          )}
        </section>
      </main>
      <SaveTemplateModal
        open={saveTemplateOpen}
        onClose={() => setSaveTemplateOpen(false)}
        sourceKind="session"
        liveSessionId={liveSessionId}
        defaultTitle={overview?.session.formTitle ?? ""}
      />
    </div>
  );
}
