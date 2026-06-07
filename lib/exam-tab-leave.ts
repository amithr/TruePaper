export type ExamTabLeavePayload = {
  deviceId: string;
  displayName: string;
};

/**
 * Best-effort tab-leave report while the page is unloading or backgrounded.
 * Prefer sendBeacon / keepalive fetch — normal fetch is often cancelled on mobile.
 */
export function postExamTabLeave(
  url: string,
  body: ExamTabLeavePayload,
  onSent?: (delivered: boolean) => void,
): void {
  const payload = JSON.stringify(body);

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([payload], { type: "application/json" });
    if (navigator.sendBeacon(url, blob)) {
      onSent?.(true);
      return;
    }
  }

  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  })
    .then((res) => onSent?.(res.ok))
    .catch(() => onSent?.(false));
}

/** Awaitable tab-leave for reconnect retries (not for page unload). */
export async function postExamTabLeaveAwait(
  url: string,
  body: ExamTabLeavePayload,
): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}
