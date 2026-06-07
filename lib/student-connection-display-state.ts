import type { ClientSyncState } from "@/lib/offline/config";
import type { ConnectionSnapshot } from "@/lib/offline/types";

/** Connection dot state for the student exam UI. */
export function studentConnectionDisplayState(
  browserOnline: boolean,
  snapshot: Pick<ConnectionSnapshot, "state">,
): ClientSyncState {
  if (!browserOnline) {
    return "offline";
  }
  if (snapshot.state === "local_only") {
    return "offline";
  }
  return snapshot.state;
}
