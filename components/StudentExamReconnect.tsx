"use client";

import { useCallback, useMemo, useState } from "react";
import QRCode from "react-qr-code";

import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { formatResumeCodeForDisplay } from "@/lib/resume-code";
import { buttonLabel } from "@/lib/ui";

type Props = {
  resumeCode: string;
  className?: string;
};

const btn =
  "tp-btn-secondary px-2.5 py-1.5 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tp-accent-ring)] focus-visible:ring-offset-1";

export function StudentExamReconnect({ resumeCode, className }: Props) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [showQrPanel, setShowQrPanel] = useState(false);
  const [origin] = useState(() =>
    typeof window !== "undefined" ? window.location.origin : "",
  );

  const normalizedCode = resumeCode.trim().toUpperCase();
  const displayCode = formatResumeCodeForDisplay(normalizedCode);

  const rejoinUrl = useMemo(() => {
    if (!origin || !normalizedCode) {
      return "";
    }
    const u = new URL("/", origin);
    u.searchParams.set("resume", normalizedCode);
    return u.toString();
  }, [normalizedCode, origin]);

  const flashCopied = useCallback((kind: "link" | "code") => {
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 2000);
  }, []);

  const onCopyLink = useCallback(async () => {
    if (!rejoinUrl) {
      return;
    }
    const ok = await copyToClipboard(rejoinUrl);
    if (ok) {
      flashCopied("link");
    }
  }, [rejoinUrl, flashCopied]);

  const onCopyCode = useCallback(async () => {
    const ok = await copyToClipboard(normalizedCode);
    if (ok) {
      flashCopied("code");
    }
  }, [normalizedCode, flashCopied]);

  if (!normalizedCode) {
    return null;
  }

  return (
    <div
      className={`rounded-lg border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-950 ${className ?? ""}`}
    >
      <p className="font-medium">Your personal rejoin code</p>
      <p className="mt-1 text-sky-900">
        Save this code or QR if you might lose this browser tab. Use it to get back to{" "}
        <strong>your</strong> answers—not the class session code.
      </p>
      <p className="mt-3 font-mono text-2xl font-bold tracking-[0.2em] text-sky-950">{displayCode}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void onCopyCode()} className={btn}>
          {copied === "code" ? buttonLabel("Code copied!") : buttonLabel("Copy rejoin code")}
        </button>
        <button type="button" onClick={() => void onCopyLink()} disabled={!rejoinUrl} className={btn}>
          {copied === "link" ? buttonLabel("Link copied!") : buttonLabel("Copy rejoin link")}
        </button>
        <button
          type="button"
          onClick={() => setShowQrPanel((v) => !v)}
          className={btn}
          aria-expanded={showQrPanel}
        >
          {showQrPanel ? buttonLabel("Hide QR") : buttonLabel("Show QR")}
        </button>
      </div>
      {showQrPanel && rejoinUrl ? (
        <div className="mt-3 inline-block rounded-lg border border-sky-200 bg-white p-3">
          <QRCode value={rejoinUrl} size={160} level="M" />
          <p className="mt-2 max-w-[12rem] text-center text-xs text-zinc-600">Scan to reopen your exam</p>
        </div>
      ) : null}
    </div>
  );
}
