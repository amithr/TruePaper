"use client";

import type { ClientSyncState } from "@/lib/offline/config";
import { useTranslations } from "@/lib/i18n/I18nProvider";

type Props = {
  state: ClientSyncState;
  pendingCount?: number;
  className?: string;
};

const STATE_CLASS: Record<ClientSyncState, string> = {
  online: "tp-conn--online",
  offline: "tp-conn--offline",
  syncing: "tp-conn--syncing",
  synced: "tp-conn--synced",
  local_only: "tp-conn--local",
};

export function ConnectionIndicator({ state, pendingCount = 0, className = "" }: Props) {
  const t = useTranslations();
  const label =
    state === "offline"
      ? t("offline.status.offline")
      : state === "syncing"
        ? t("offline.status.syncing")
        : state === "local_only"
          ? t("offline.status.localOnly")
          : pendingCount > 0
            ? t("offline.status.pending", { n: pendingCount })
            : t("offline.status.synced");

  return (
    <div
      className={`tp-conn-indicator ${STATE_CLASS[state]} ${className}`}
      role="status"
      aria-live="polite"
      data-testid="connection-indicator"
      data-state={state}
    >
      <span className="tp-conn-dot" aria-hidden />
      <span className="tp-conn-label">{label}</span>
    </div>
  );
}
