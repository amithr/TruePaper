"use client";

import { useCallback, useEffect, useState } from "react";

/** Browser fullscreen for the page; `supported` is false in browsers (and jsdom) without the API. */
export function useFullscreen(): { active: boolean; supported: boolean; toggle: () => void } {
  const [active, setActive] = useState(false);
  const supported = typeof document !== "undefined" && typeof document.documentElement.requestFullscreen === "function";

  useEffect(() => {
    const sync = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggle = useCallback(() => {
    if (!supported) {
      return;
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
  }, [supported]);

  return { active, supported, toggle };
}
