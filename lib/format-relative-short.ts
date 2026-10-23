/** "2 minutes ago" / "in 3 hours" in the viewer's locale; "" for missing or bad input. */
export function formatRelativeShort(iso: string | null | undefined, nowMs: number): string {
  if (!iso) {
    return "";
  }
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) {
    return "";
  }
  const deltaSec = Math.round((then - nowMs) / 1000);
  const abs = Math.abs(deltaSec);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (abs < 60) {
    return rtf.format(deltaSec, "second");
  }
  if (abs < 3600) {
    return rtf.format(Math.round(deltaSec / 60), "minute");
  }
  if (abs < 86400) {
    return rtf.format(Math.round(deltaSec / 3600), "hour");
  }
  return rtf.format(Math.round(deltaSec / 86400), "day");
}
