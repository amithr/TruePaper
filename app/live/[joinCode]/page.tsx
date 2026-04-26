"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { isValidJoinCodeFormat, normalizeJoinCode } from "@/lib/join-code";
import type { LivePublicBoardPayload } from "@/lib/live-public-board";

function formatCountdown(ms: number): string {
  if (ms <= 0) {
    return "0:00";
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function questionTypeLabel(type: string): string {
  if (type === "multipleChoice") {
    return "Multiple choice";
  }
  if (type === "text") {
    return "Written response";
  }
  return type;
}

function formatQuestionSummary(counts: Record<string, number>): string {
  const entries = Object.entries(counts).filter(([, n]) => n > 0);
  if (entries.length === 0) {
    return "No questions on this form.";
  }
  return entries
    .map(([type, n]) => `${n} ${questionTypeLabel(type)}${n === 1 ? "" : "s"}`)
    .join(" · ");
}

function totalQuestions(counts: Record<string, number>): number {
  return Object.values(counts).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
}

export default function LiveClassDisplayPage() {
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
      setError("This link does not contain a valid join code.");
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
        setError(data.error ?? "This session is not open or could not be loaded.");
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
      setError("Could not load session information.");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [code, codeOk]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    if (!codeOk || !board) {
      return;
    }
    const id = window.setInterval(() => {
      void loadBoard({ silent: true });
    }, 5000);
    return () => window.clearInterval(id);
  }, [codeOk, board, loadBoard]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const msLeft = board ? new Date(board.closesAt).getTime() - nowTick : 0;
  const sessionOpen = board ? msLeft > 0 && nowTick >= new Date(board.opensAt).getTime() : false;

  const engagementLine = board
    ? board.assignedCount <= 0
      ? "No students have joined this session yet."
      : `${board.inProgressCount} of ${board.assignedCount} students are actively working on the exam right now (others may be idle, paused for leaving the tab, or finished).`
    : "";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
        <p className="mb-6 text-center text-sm font-medium uppercase tracking-widest text-zinc-500">
          Live class display
        </p>

        {loading && !error && codeOk ? (
          <p className="text-center text-lg text-zinc-400">Loading session…</p>
        ) : null}

        {!loading && error ? (
          <div className="rounded-2xl border border-zinc-700 bg-zinc-900/80 p-8 text-center">
            <p className="text-lg text-zinc-200">{error}</p>
            <p className="mt-4 text-sm text-zinc-500">
              This page only works while the session window is open. Ask your teacher for an updated
              link or code.
            </p>
            <Link
              href="/"
              className="mt-6 inline-block text-sm font-medium text-emerald-400 underline underline-offset-2"
            >
              Student join page
            </Link>
          </div>
        ) : null}

        {!loading && board && sessionOpen ? (
          <div className="space-y-10 text-center">
            <div>
              <p className="text-sm font-medium text-zinc-400">Join code</p>
              <p className="mt-2 font-mono text-5xl font-bold tracking-[0.35em] text-white sm:text-6xl">
                {board.joinCode}
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-700 bg-zinc-900/60 px-6 py-8">
              <h1 className="text-2xl font-bold leading-snug text-white sm:text-3xl">{board.formTitle}</h1>
              <p className="mt-4 text-lg text-zinc-300">
                Time limit:{" "}
                <span className="font-semibold text-white">
                  {board.durationMinutes} minute{board.durationMinutes === 1 ? "" : "s"}
                </span>
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-400">
                Time remaining {formatCountdown(msLeft)}
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-700 bg-zinc-900/60 px-6 py-8 text-left sm:text-center">
              <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">Exam structure</p>
              <p className="mt-3 text-xl font-semibold text-white">
                {totalQuestions(board.questionCounts)} question
                {totalQuestions(board.questionCounts) === 1 ? "" : "s"}
              </p>
              <p className="mt-2 text-lg text-zinc-300">{formatQuestionSummary(board.questionCounts)}</p>
            </div>

            <div className="rounded-2xl border border-emerald-900/50 bg-emerald-950/40 px-6 py-8">
              <p className="text-lg leading-relaxed text-emerald-100">{engagementLine}</p>
            </div>
          </div>
        ) : null}

        {!loading && board && !sessionOpen ? (
          <div className="rounded-2xl border border-zinc-700 bg-zinc-900/80 p-8 text-center">
            <p className="text-lg text-zinc-200">This session has ended or is not open yet.</p>
            <Link
              href="/"
              className="mt-6 inline-block text-sm font-medium text-emerald-400 underline underline-offset-2"
            >
              Student join page
            </Link>
          </div>
        ) : null}

        <p className="mt-12 text-center text-xs text-zinc-600">
          For display in the classroom only. Question text and answers are not shown here.
        </p>
      </main>
    </div>
  );
}
