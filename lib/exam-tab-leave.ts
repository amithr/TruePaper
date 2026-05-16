export type ExamTabLeavePayload = {
  deviceId: string;
  displayName: string;
};

/**
 * Best-effort tab-leave report while the page is unloading or backgrounded.
 * Prefer sendBeacon / keepalive fetch — normal fetch is often cancelled on mobile.
 */
export function postExamTabLeave(url: string, body: ExamTabLeavePayload): void {
  const payload = JSON.stringify(body);

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([payload], { type: "application/json" });
    if (navigator.sendBeacon(url, blob)) {
      return;
    }
  }

  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  });
}
