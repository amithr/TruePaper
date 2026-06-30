"use client";

import { useEffect, useRef, useState } from "react";

import { rosterConnectionSyncState } from "@/components/RosterWifiIcon";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import type { LiveSessionOverviewParticipant } from "@/lib/live-session-overview";
import { focusRing } from "@/lib/ui";

type Props = {
  participants: LiveSessionOverviewParticipant[];
  /** Coarse clock so a silent disconnect (stale last_seen) also counts as unsynced. */
  nowMs?: number;
};

/**
 * Roster-level "who has unsynced work" view for teachers running a class. Derives
 * from the already-polled overview presence (no extra round-trip). Calm: shows
 * nothing when everyone is synced; a neutral count chip otherwise, expandable to
 * the specific names so a teacher knows which devices to check.
 */
export function RosterSyncSummary({ participants, nowMs = 0 }: Props) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const unsynced = participants.filter((p) => {
    if (p.finishedAt || p.gradedAt) {
      return false;
    }
    return rosterConnectionSyncState(p, nowMs) !== "synced";
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (unsynced.length === 0) {
    return null;
  }

  return (
    <div ref={rootRef} className="tp-roster-sync">
      <button
        type="button"
        className={`tp-roster-sync__chip ${focusRing}`}
        aria-expanded={open}
        aria-label={`${t("sync.roster.scope")} — ${t("sync.roster.summary", { count: unsynced.length })}`}
        data-testid="roster-sync-summary"
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          aria-hidden
          className="tp-roster-sync__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <span className="tp-roster-sync__dot" aria-hidden />
        {t("sync.roster.summary", { count: unsynced.length })}
      </button>

      {open ? (
        <div role="status" className="tp-roster-sync__panel">
          <p className="tp-roster-sync__panel-eyebrow">{t("sync.roster.scope")}</p>
          <p className="tp-roster-sync__panel-title">{t("sync.roster.title")}</p>
          <ul className="tp-roster-sync__list">
            {unsynced.map((p) => (
              <li key={p.anonymousSessionId} className="tp-roster-sync__name">
                {p.displayName || t("session.roster.noName")}
              </li>
            ))}
          </ul>
          <p className="tp-roster-sync__hint">{t("sync.roster.hint")}</p>
        </div>
      ) : null}
    </div>
  );
}
