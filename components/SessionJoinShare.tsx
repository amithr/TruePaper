"use client";

import { useCallback, useMemo, useState } from "react";
import QRCode from "react-qr-code";

import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { buildStudentJoinUrl } from "@/lib/student-join-url";

type Props = {
  joinCode: string;
  showQr?: boolean;
  className?: string;
};

const btnBase =
  "inline-flex items-center gap-1.5 rounded-[var(--tp-radius-sm)] border border-[var(--tp-border-strong)] bg-[var(--tp-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--tp-text)] shadow-sm transition-all duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tp-accent-ring)] focus-visible:ring-offset-1 hover:bg-[var(--tp-bg-subtle)] active:scale-[0.97]";

const btnSuccess =
  "inline-flex items-center gap-1.5 rounded-[var(--tp-radius-sm)] border border-[var(--tp-success-border)] bg-[var(--tp-mint-soft)] px-2.5 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm";

function CopyIcon() {
  return (
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
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function CheckIcon() {
  return (
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
  );
}

function QrIcon() {
  return (
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
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3M21 14v3M21 21h-3M14 21v-4" />
    </svg>
  );
}

export function SessionJoinShare({ joinCode, showQr = true, className }: Props) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [showQrPanel, setShowQrPanel] = useState(false);
  const [origin] = useState(() =>
    typeof window !== "undefined" ? window.location.origin : "",
  );

  const qrUrl = useMemo(() => (origin ? buildStudentJoinUrl(origin, joinCode) : ""), [
    origin,
    joinCode,
  ]);

  const flashCopied = useCallback((kind: "link" | "code") => {
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1800);
  }, []);

  const onCopyLink = useCallback(async () => {
    if (!origin) {
      return;
    }
    const link = buildStudentJoinUrl(origin, joinCode);
    if (!link) {
      return;
    }
    const ok = await copyToClipboard(link);
    if (ok) {
      flashCopied("link");
    }
  }, [origin, joinCode, flashCopied]);

  const onCopyCode = useCallback(async () => {
    const ok = await copyToClipboard(joinCode);
    if (ok) {
      flashCopied("code");
    }
  }, [joinCode, flashCopied]);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void onCopyLink()}
          disabled={!origin}
          className={copied === "link" ? btnSuccess : btnBase}
        >
          {copied === "link" ? <CheckIcon /> : <CopyIcon />}
          {copied === "link" ? "Link copied" : "Copy link"}
        </button>
        <button
          type="button"
          onClick={() => void onCopyCode()}
          className={copied === "code" ? btnSuccess : btnBase}
        >
          {copied === "code" ? <CheckIcon /> : <CopyIcon />}
          {copied === "code" ? "Code copied" : "Copy code"}
        </button>
        {showQr ? (
          <button
            type="button"
            onClick={() => setShowQrPanel((v) => !v)}
            className={btnBase}
            aria-expanded={showQrPanel}
          >
            <QrIcon />
            {showQrPanel ? "Hide QR" : "Show QR"}
          </button>
        ) : null}
      </div>
      {showQr && showQrPanel && qrUrl ? (
        <div className="mt-3 inline-block rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-surface)] p-3 tp-anim-fade-up shadow-sm">
          <div className="rounded-[var(--tp-radius-xs)] bg-white p-2">
            <QRCode value={qrUrl} size={128} className="h-32 w-32" />
          </div>
          <p className="mt-2 max-w-[10rem] text-center text-[10px] leading-relaxed text-[var(--tp-text-muted)]">
            Scan to join on a phone
          </p>
        </div>
      ) : null}
    </div>
  );
}
