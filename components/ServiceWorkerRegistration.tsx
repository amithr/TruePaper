"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* best-effort */
    });

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "OFFLINE_SYNC_DRAINED") {
        window.dispatchEvent(new CustomEvent("truepaper-offline-sync-drained"));
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  return null;
}
