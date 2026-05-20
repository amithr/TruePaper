"use client";

import { useCallback, useState } from "react";

import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { buttonLabel } from "@/lib/ui";

type Props = {
  liveSessionId: string;
  deviceId: string;
  disabled?: boolean;
  className?: string;
};

const btn =
  "inline-flex items-center gap-1.5 rounded-[var(--tp-radius-sm)] border border-[var(--tp-border-strong)] bg-[var(--tp-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--tp-text)] shadow-sm transition-all duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tp-accent-ring)] focus-visible:ring-offset-1 hover:bg-[var(--tp-bg-subtle)] active:scale-[0.97] disabled:opacity-50";

const btnDone =
  "inline-flex items-center gap-1.5 rounded-[var(--tp-radius-sm)] border border-[var(--tp-success-border)] bg-[var(--tp-mint-soft)] px-2.5 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm";

export function StudentReviewShare({ liveSessionId, deviceId, disabled = false, className }: Props) {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onCopyLink = useCallback(async () => {
    if (disabled || loading) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/forms/live-sessions/${liveSessionId}/participants/${encodeURIComponent(deviceId)}/review-link`,
        { method: "POST" },
      );
      const data = (await res.json()) as { reviewUrl?: string; error?: string };
      if (!res.ok || !data.reviewUrl) {
        throw new Error(data.error ?? "Could not create review link.");
      }
      const ok = await copyToClipboard(data.reviewUrl);
      if (ok) {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2500);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not copy link.");
    } finally {
      setLoading(false);
    }
  }, [liveSessionId, deviceId, disabled, loading]);

  return (
    <div className={className}>
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => void onCopyLink()}
        className={copied ? btnDone : btn}
      >
        {copied ? (
          <svg
            aria-hidden
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12l5 5L20 7" />
          </svg>
        ) : (
          <svg
            aria-hidden
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
            <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
          </svg>
        )}
        {loading ? buttonLabel("Creating…") : copied ? "Link copied" : "Copy results link"}
      </button>
      {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
