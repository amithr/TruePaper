import type { ConnectionSnapshot } from "@/lib/offline/types";

export function heartbeatSyncMeta(snapshot: Pick<ConnectionSnapshot, "state" | "pendingCount">): {
  pendingSyncCount: number;
  syncState: "synced" | "pending" | "offline";
} {
  const online = typeof navigator !== "undefined" && navigator.onLine;
  if (!online) {
    return { pendingSyncCount: snapshot.pendingCount, syncState: "offline" };
  }
  if (snapshot.pendingCount > 0 || snapshot.state === "syncing") {
    return { pendingSyncCount: snapshot.pendingCount, syncState: "pending" };
  }
  return { pendingSyncCount: 0, syncState: "synced" };
}
