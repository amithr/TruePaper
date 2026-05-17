"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "react-qr-code";

import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { buildStudentJoinUrl } from "@/lib/student-join-url";
import { buttonLabel } from "@/lib/ui";

type Props = {
  joinCode: string;
  showQr?: boolean;
  className?: string;
};

const btn =
  "tp-btn-secondary px-2.5 py-1.5 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tp-accent-ring)] focus-visible:ring-offset-1";

export function SessionJoinShare({ joinCode, showQr = true, className }: Props) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [showQrPanel, setShowQrPanel] = useState(false);
  const [origin, setOrigin] = useState("");
  const [qrJoinUrl, setQrJoinUrl] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const flashCopied = useCallback((kind: "link" | "code") => {
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 2000);
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

  const onToggleQr = useCallback(() => {
    setShowQrPanel((v) => {
      const next = !v;
      if (next && origin) {
        setQrJoinUrl(buildStudentJoinUrl(origin, joinCode));
      }
      return next;
    });
  }, [origin, joinCode]);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void onCopyLink()} disabled={!origin} className={btn}>
          {copied === "link" ? buttonLabel("Join link copied!") : buttonLabel("Copy join link")}
        </button>
        <button type="button" onClick={() => void onCopyCode()} className={btn}>
          {copied === "code" ? buttonLabel("Code copied!") : buttonLabel("Copy code")}
        </button>
        {showQr ? (
          <button
            type="button"
            onClick={onToggleQr}
            className={btn}
            aria-expanded={showQrPanel}
          >
            {showQrPanel ? buttonLabel("Hide QR") : buttonLabel("Show QR")}
          </button>
        ) : null}
      </div>
      {showQr && showQrPanel && qrJoinUrl ? (
        <div className="mt-3 inline-block rounded-lg border border-zinc-200 bg-white p-3">
          <p className="mb-2 text-xs text-zinc-600">
            Each scan opens a new student attempt on that device (not a shared browser identity).
          </p>
          <div className="rounded-md bg-white p-2">
            <QRCode value={qrJoinUrl} size={128} className="h-32 w-32" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
