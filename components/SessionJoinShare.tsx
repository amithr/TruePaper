"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "react-qr-code";

import { copyToClipboard } from "@/lib/copy-to-clipboard";

type Props = {
  joinCode: string;
  /** When false, QR is not offered (keeps bundle lighter if ever tree-shaken). */
  showQr?: boolean;
  className?: string;
};

const btn =
  "rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1";

export function SessionJoinShare({ joinCode, showQr = true, className }: Props) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [showQrPanel, setShowQrPanel] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const joinUrl = useMemo(() => {
    if (!origin) {
      return "";
    }
    const u = new URL("/", origin);
    u.searchParams.set("code", joinCode);
    return u.toString();
  }, [joinCode, origin]);

  const flashCopied = useCallback((kind: "link" | "code") => {
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 2000);
  }, []);

  const onCopyLink = useCallback(async () => {
    if (!joinUrl) {
      return;
    }
    const ok = await copyToClipboard(joinUrl);
    if (ok) {
      flashCopied("link");
    }
  }, [joinUrl, flashCopied]);

  const onCopyCode = useCallback(async () => {
    const ok = await copyToClipboard(joinCode);
    if (ok) {
      flashCopied("code");
    }
  }, [joinCode, flashCopied]);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void onCopyLink()} disabled={!joinUrl} className={btn}>
          {copied === "link" ? "Join link copied!" : "Copy join link"}
        </button>
        <button type="button" onClick={() => void onCopyCode()} className={btn}>
          {copied === "code" ? "Code copied!" : "Copy code"}
        </button>
        {showQr ? (
          <button
            type="button"
            onClick={() => setShowQrPanel((v) => !v)}
            className={btn}
            aria-expanded={showQrPanel}
          >
            {showQrPanel ? "Hide QR" : "Show QR"}
          </button>
        ) : null}
      </div>
      {showQr && showQrPanel && joinUrl ? (
        <div className="mt-3 inline-block rounded-lg border border-zinc-200 bg-white p-3">
          <p className="mb-2 text-xs text-zinc-600">Scan to open the join page with this code prefilled.</p>
          <div className="rounded-md bg-white p-2">
            <QRCode value={joinUrl} size={128} className="h-32 w-32" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
