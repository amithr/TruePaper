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
  "tp-btn-secondary px-2.5 py-1.5 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tp-accent-ring)] focus-visible:ring-offset-1";

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
        className={btn}
      >
        {loading
          ? buttonLabel("Creating link…")
          : copied
            ? buttonLabel("Link copied")
            : buttonLabel("Copy results link")}
      </button>
      {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
