"use client";

import { useEffect } from "react";

import {
  installExamCaptureGuards,
  type CaptureViolationKind,
} from "@/lib/exam-capture-protection";

/** Installs screen-capture guards while a student exam is active. */
export function useExamCaptureProtection(
  enabled: boolean,
  onViolation: (kind: CaptureViolationKind) => void,
): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    return installExamCaptureGuards({ onViolation });
  }, [enabled, onViolation]);
}
