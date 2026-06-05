import { isAirAlertEnabled } from "@/lib/offline/config";

export type AirAlertState = {
  active: boolean;
  region?: string;
  checkedAt: number;
};

const CACHE_MS = 60_000;

let lastState: AirAlertState = { active: false, checkedAt: 0 };

/** Best-effort air-alert poll (feature-flagged). Does not block exam saves. */
export async function fetchAirAlertState(regionId?: string): Promise<AirAlertState> {
  if (!isAirAlertEnabled()) {
    return { active: false, checkedAt: Date.now() };
  }
  if (Date.now() - lastState.checkedAt < CACHE_MS) {
    return lastState;
  }
  try {
    const res = await fetch("https://api.alerts.in.ua/v1/alerts/active.json", {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      return lastState;
    }
    const data = (await res.json()) as { alerts?: Array<{ regionId?: number; regionName?: string }> };
    const alerts = data.alerts ?? [];
    const match = regionId
      ? alerts.some((a) => String(a.regionId) === regionId)
      : alerts.length > 0;
    lastState = {
      active: match,
      region: regionId,
      checkedAt: Date.now(),
    };
    return lastState;
  } catch {
    return lastState;
  }
}
