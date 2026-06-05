"use client";

import { useEffect } from "react";

import { BODY_FOCUS_ATTR } from "@/lib/focus-mode";

/** Marks the page as a focus surface so global footer/cookie chrome stays hidden. */
export function useBodyFocusMode(active: boolean): void {
  useEffect(() => {
    if (!active) {
      return;
    }
    document.body.setAttribute(BODY_FOCUS_ATTR, "true");
    return () => {
      document.body.removeAttribute(BODY_FOCUS_ATTR);
    };
  }, [active]);
}
