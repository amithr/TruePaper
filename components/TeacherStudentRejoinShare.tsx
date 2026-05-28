"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { formatResumeCodeForDisplay } from "@/lib/resume-code";
import { buttonLabel, focusRing } from "@/lib/ui";

type Props = {
  liveSessionId: string;
  deviceId: string;
  initialCode?: string | null;
  studentLabel?: string;
  disabled?: boolean;
  className?: string;
};

const btn =
  "inline-flex items-center gap-1.5 rounded-[var(--tp-radius-sm)] border border-[var(--tp-border-strong)] bg-[var(--tp-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--tp-text)] shadow-sm transition-all duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tp-accent-ring)] focus-visible:ring-offset-1 hover:bg-[var(--tp-bg-subtle)] active:scale-[0.97] disabled:opacity-50";

const btnDone =
  "inline-flex items-center gap-1.5 rounded-[var(--tp-radius-sm)] border border-[var(--tp-success-border)] bg-[var(--tp-mint-soft)] px-2.5 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm";

export function TeacherStudentRejoinShare({
  liveSessionId,
  deviceId,
  initialCode = null,
  studentLabel,
  disabled = false,
  className,
}: Props) {
  const normalizedInitial = initialCode?.trim().toUpperCase() ?? "";
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const resumeCode = generatedCode ?? normalizedInitial;
  const displayCode = resumeCode ? formatResumeCodeForDisplay(resumeCode) : "";
  const hasCode = Boolean(resumeCode);

  const rejoinUrl = useMemo(() => {
    if (typeof window === "undefined" || !resumeCode) {
      return "";
    }
    const u = new URL("/", window.location.origin);
    u.searchParams.set("resume", resumeCode);
    return u.toString();
  }, [resumeCode]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setCopied(null);
  }, []);

  useEffect(() => {
    if (!modalOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeModal();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalOpen, closeModal]);

  useEffect(() => {
    if (!modalOpen) {
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [modalOpen]);

  const flashCopied = useCallback((kind: "code" | "link") => {
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 2000);
  }, []);

  const generateCode = useCallback(async (): Promise<boolean> => {
    if (disabled || loading) {
      return false;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/forms/live-sessions/${liveSessionId}/participants/${encodeURIComponent(deviceId)}/rejoin-code`,
        { method: "POST" },
      );
      const data = (await res.json()) as {
        resumeCode?: string;
        error?: string;
      };
      if (!res.ok || !data.resumeCode) {
        throw new Error(data.error ?? "Could not create rejoin code.");
      }
      setGeneratedCode(data.resumeCode.trim().toUpperCase());
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create rejoin code.");
      return false;
    } finally {
      setLoading(false);
    }
  }, [liveSessionId, deviceId, disabled, loading]);

  const openModal = useCallback(async () => {
    if (disabled) {
      return;
    }
    setError("");
    setCopied(null);
    if (hasCode) {
      setModalOpen(true);
      return;
    }
    setModalOpen(true);
    await generateCode();
  }, [disabled, hasCode, generateCode]);

  const onCopyCode = useCallback(async () => {
    if (!resumeCode) {
      return;
    }
    const ok = await copyToClipboard(resumeCode);
    if (ok) {
      flashCopied("code");
    }
  }, [resumeCode, flashCopied]);

  const onCopyLink = useCallback(async () => {
    if (!rejoinUrl) {
      return;
    }
    const ok = await copyToClipboard(rejoinUrl);
    if (ok) {
      flashCopied("link");
    }
  }, [rejoinUrl, flashCopied]);

  if (disabled) {
    return null;
  }

  const modalTitle = studentLabel?.trim()
    ? `Rejoin code for ${studentLabel.trim()}`
    : "Student rejoin code";

  return (
    <>
      <div className={className}>
        <button type="button" disabled={loading} onClick={() => void openModal()} className={btn}>
          {loading
            ? buttonLabel("Generating…")
            : hasCode
              ? buttonLabel("Rejoin code")
              : buttonLabel("Generate rejoin code")}
        </button>
      </div>

      {modalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="presentation"
          onClick={closeModal}
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="rejoin-code-dialog-title"
            className="relative z-10 w-full max-w-md rounded-[var(--tp-radius)] border border-[var(--tp-border)] bg-[var(--tp-surface)] p-6 shadow-xl tp-anim-fade-in"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">
                  Rejoin code
                </p>
                <h2
                  id="rejoin-code-dialog-title"
                  className="mt-1 text-lg font-semibold text-[var(--tp-text)]"
                >
                  {modalTitle}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className={`rounded-[var(--tp-radius-xs)] p-1.5 text-[var(--tp-text-muted)] hover:bg-[var(--tp-bg-subtle)] hover:text-[var(--tp-text)] ${focusRing}`}
                aria-label="Close"
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
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            {loading && !hasCode ? (
              <p className="mt-6 text-sm text-[var(--tp-text-secondary)]">Generating rejoin code…</p>
            ) : error ? (
              <div className="mt-6 space-y-3">
                <p className="tp-alert tp-alert-error text-sm">{error}</p>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void generateCode()}
                  className={btn}
                >
                  {loading ? buttonLabel("Generating…") : buttonLabel("Try again")}
                </button>
              </div>
            ) : hasCode ? (
              <div className="mt-6 rounded-[var(--tp-radius-sm)] border border-sky-200 bg-sky-50/70 px-4 py-4 text-sm text-sky-950">
                <p className="font-mono text-2xl font-bold tracking-[0.2em]">{displayCode}</p>
                <p className="mt-3 text-sm text-sky-900">
                  Give this to the student if they lost their browser. They enter it on the join page
                  under &ldquo;Lost your exam?&rdquo;
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void onCopyCode()}
                    className={copied === "code" ? btnDone : btn}
                  >
                    {copied === "code" ? "Code copied" : "Copy code"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onCopyLink()}
                    disabled={!rejoinUrl}
                    className={copied === "link" ? btnDone : btn}
                  >
                    {copied === "link" ? "Link copied" : "Copy link"}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-6 flex justify-end">
              <button type="button" onClick={closeModal} className={`tp-btn-ghost text-sm ${focusRing}`}>
                {buttonLabel("Done")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
