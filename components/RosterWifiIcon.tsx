"use client";

type Props = {
  syncState: "synced" | "pending" | "offline";
  label: string;
};

/** Small wifi glyph for roster connection status (online / syncing / offline). */
export function RosterWifiIcon({ syncState, label }: Props) {
  const dataState = syncState === "synced" ? "online" : syncState;

  return (
    <span
      className={`tp-roster-wifi tp-roster-wifi--${syncState}`}
      data-testid="roster-sync-badge"
      data-sync-state={dataState}
      title={label}
      aria-label={label}
      role="img"
    >
      <svg
        viewBox="0 0 24 24"
        width={18}
        height={18}
        aria-hidden
        focusable="false"
        className="tp-roster-wifi__svg"
      >
        <path
          fill="currentColor"
          d="M12 20a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z"
        />
        <path
          fill="currentColor"
          d="M7.05 16.05a6 6 0 0 1 9.9 0 .9.9 0 1 1-1.48 1.02 4.2 4.2 0 0 0-6.94 0 .9.9 0 0 1-1.48-1.02Z"
        />
        <path
          fill="currentColor"
          d="M3.52 12.52a10.5 10.5 0 0 1 16.96 0 .9.9 0 1 1-1.45 1.06 8.7 8.7 0 0 0-14.06 0 .9.9 0 0 1-1.45-1.06Z"
        />
        <path
          fill="currentColor"
          d="M1 9a14.25 14.25 0 0 1 22 0 .9.9 0 0 1-1.45 1.06 12.45 12.45 0 0 0-19.1 0A.9.9 0 0 1 1 9Z"
        />
      </svg>
    </span>
  );
}

export function rosterConnectionSyncState(
  participant: Pick<
    { syncState: "synced" | "pending" | "offline"; pendingSyncCount: number },
    "syncState" | "pendingSyncCount"
  >,
): "synced" | "pending" | "offline" {
  if (participant.syncState === "offline") {
    return "offline";
  }
  if (participant.syncState === "pending" || participant.pendingSyncCount > 0) {
    return "pending";
  }
  return "synced";
}
