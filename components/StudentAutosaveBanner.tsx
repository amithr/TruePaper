"use client";

import { forwardRef, useImperativeHandle, useState } from "react";

export type StudentAutosaveBannerHandle = {
  setMessage: (message: string) => void;
};

type Props = {
  className?: string;
};

/** Isolated autosave status so saving does not re-render the exam form / textareas. */
export const StudentAutosaveBanner = forwardRef<StudentAutosaveBannerHandle, Props>(
  function StudentAutosaveBanner({ className }, ref) {
    const [message, setMessage] = useState("");

    useImperativeHandle(ref, () => ({
      setMessage,
    }));

    return (
      <p
        data-testid="student-autosave-status"
        className={className ?? "text-sm text-[var(--tp-text-secondary)]"}
        aria-live="polite"
      >
        {message || "\u00a0"}
      </p>
    );
  },
);
