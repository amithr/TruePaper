"use client";

import { LocaleLink as Link } from "@/lib/i18n/client";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { LoadingBar } from "@/components/LoadingBar";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { isValidJoinCodeFormat, normalizeJoinCode } from "@/lib/join-code";
import type { LivePublicBoardPayload } from "@/lib/live-public-board";
import { isNoTimeLimitSession } from "@/lib/session-window";
import { deferEffect } from "@/lib/defer-effect";
import { usePollingRefresh } from "@/lib/use-polling-refresh";

function formatCountdown(ms: number): string {
  if (ms <= 0) {
    return "0:00";
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function questionTypeLabel(type: string, t: ReturnType<typeof useTranslations>): string {
  if (type === "multipleChoice") {
    return t("liveDisplay.typeMc");
  }
  if (type === "text") {
    return t("liveDisplay.typeText");
  }
  return type;
}

function formatQuestionSummary(
  counts: Record<string, number>,
  t: ReturnType<typeof useTranslations>,
): string {
  const entries = Object.entries(counts).filter(([, n]) => n > 0);
  if (entries.length === 0) {
    return t("liveDisplay.noQuestions");
  }
  return entries
    .map(([type, n]) => `${n} ${questionTypeLabel(type, t)}${n === 1 ? "" : "s"}`)
    .join(" · ");
}

function totalQuestions(counts: Record<string, number>): number {
  return Object.values(counts).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
}

export default function LiveClassDisplayPage() {
  const t = useTranslations();
  const params = useParams();
  const rawParam = typeof params.joinCode === "string" ? params.joinCode : "";
  const code = normalizeJoinCode(decodeURIComponent(rawParam));

  const [nowTick, setNowTick] = useState(() => Date.now());
  const [board, setBoard] = useState<LivePublicBoardPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const codeOk = useMemo(() => isValidJoinCodeFormat(code), [code]);

  const loadBoard = useCallback(async (opts?: { silent?: boolean }) => {
    if (!codeOk) {
      setBoard(null);
      setError(t("liveDisplay.errorInvalidCode"));
      setLoading(false);
      return;
    }
    const silent = Boolean(opts?.silent);
    if (!silent) {
      setLoading(true);
    }
    setError("");
    try {
      const response = await fetch(`/api/public/live-board?code=${encodeURIComponent(code)}`);
      const data = (await response.json()) as LivePublicBoardPayload & { error?: string };
      if (!response.ok) {
        setBoard(null);
        setError(data.error ?? t("liveDisplay.errorNotOpen"));
        return;
      }
      setBoard({
        joinCode: data.joinCode,
        formTitle: data.formTitle,
        opensAt: data.opensAt,
        closesAt: data.closesAt,
        durationMinutes: data.durationMinutes,
        questionCounts: data.questionCounts ?? {},
        assignedCount: data.assignedCount ?? 0,
        inProgressCount: data.inProgressCount ?? 0,
      });
    } catch {
      setBoard(null);
      setError(t("liveDisplay.errorLoadFailed"));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [code, codeOk, t]);

  useEffect(() => {
    deferEffect(() => {
      void loadBoard();
    });
  }, [loadBoard]);

  usePollingRefresh({
    enabled: codeOk,
    intervalMs: 5000,
    immediate: false,
    onRefresh: () => void loadBoard({ silent: true }),
  });

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const msLeft = board ? new Date(board.closesAt).getTime() - nowTick : 0;
  const sessionOpen = board ? msLeft > 0 && nowTick >= new Date(board.opensAt).getTime() : false;
  const noTimeLimit = board ? isNoTimeLimitSession(board.opensAt, board.closesAt) : false;

  const engagementLine = board
    ? board.assignedCount <= 0
      ? t("liveDisplay.engagementNone")
      : t("liveDisplay.engagementActive", {
          inProgress: board.inProgressCount,
          assigned: board.assignedCount,
        })
    : "";
  const questionTotal = board ? totalQuestions(board.questionCounts) : 0;

  return (
    <div
      className="min-h-screen text-zinc-50"
      style={{
        background:
          "radial-gradient(ellipse at top, #1e293b 0%, #0f172a 60%, #020617 100%)",
      }}
    >
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
        <p className="mb-6 text-center text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">
          {t("liveDisplay.eyebrow")}
        </p>

        {loading && !error && codeOk ? (
          <LoadingBar className="mx-auto max-w-xs" variant="dark" label={t("loading.session")} />
        ) : null}

        {!loading && error ? (
          <div className="rounded-2xl border border-zinc-700 bg-zinc-900/80 p-8 text-center">
            <p className="text-lg text-zinc-200">{error}</p>
            <p className="mt-4 text-sm text-zinc-500">
              {t("liveDisplay.errorHint")}
            </p>
            <Link
              href="/"
              className="mt-6 inline-block text-sm font-medium text-emerald-400 underline underline-offset-2"
            >
              {t("liveDisplay.studentJoinLink")}
            </Link>
          </div>
        ) : null}

        {!loading && board && sessionOpen ? (
          <div className="space-y-10 text-center tp-anim-fade-up">
            <div>
              <p className="text-sm font-medium text-zinc-400">{t("liveDisplay.joinCode")}</p>
              <p
                className="mt-2 font-mono text-5xl font-semibold tracking-[0.35em] sm:text-6xl"
                style={{
                  background:
                    "linear-gradient(135deg, #60a5fa 0%, #a78bfa 50%, #34d399 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {board.joinCode}
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-700 bg-zinc-900/60 px-6 py-8">
              <h1 className="text-2xl font-semibold leading-snug text-white sm:text-3xl">{board.formTitle}</h1>
              <p className="mt-4 text-lg text-zinc-300">
                {t("liveDisplay.timeLimit")}{" "}
                <span className="font-semibold text-white">
                  {noTimeLimit
                    ? t("common.noTimeLimit")
                    : board.durationMinutes === 1
                      ? t("liveDisplay.minutesOne", { n: board.durationMinutes })
                      : t("liveDisplay.minutesOther", { n: board.durationMinutes })}
                </span>
              </p>
              {!noTimeLimit ? (
                <p className="mt-3 text-3xl font-semibold tabular-nums text-emerald-400 sm:text-4xl">
                  {formatCountdown(msLeft)}
                </p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-zinc-700 bg-zinc-900/60 px-6 py-8 text-left sm:text-center">
              <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">{t("liveDisplay.examStructure")}</p>
              <p className="mt-3 text-xl font-semibold text-white">
                {questionTotal === 1
                  ? t("liveDisplay.questionCountOne", { n: questionTotal })
                  : t("liveDisplay.questionCountOther", { n: questionTotal })}
              </p>
              <p className="mt-2 text-lg text-zinc-300">{formatQuestionSummary(board.questionCounts, t)}</p>
            </div>

            <div className="rounded-2xl border border-emerald-900/50 bg-emerald-950/40 px-6 py-8">
              <p className="text-lg leading-relaxed text-emerald-100">{engagementLine}</p>
            </div>
          </div>
        ) : null}

        {!loading && board && !sessionOpen ? (
          <div className="rounded-2xl border border-zinc-700 bg-zinc-900/80 p-8 text-center">
            <p className="text-lg text-zinc-200">{t("liveDisplay.ended")}</p>
            <Link
              href="/"
              className="mt-6 inline-block text-sm font-medium text-emerald-400 underline underline-offset-2"
            >
              {t("liveDisplay.studentJoinLink")}
            </Link>
          </div>
        ) : null}

        <p className="mt-12 text-center text-xs text-zinc-600">
          {t("liveDisplay.footer")}
        </p>
      </main>
    </div>
  );
}
