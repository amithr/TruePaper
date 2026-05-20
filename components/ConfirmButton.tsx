"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Tone = "primary" | "secondary" | "danger";

type Props = {
  label: ReactNode;
  confirmLabel?: ReactNode;
  busyLabel?: ReactNode;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  busy?: boolean;
  tone?: Tone;
  className?: string;
  /** ms before the "click again" state resets back. */
  timeoutMs?: number;
  ariaLabel?: string;
  testId?: string;
};

const toneClass: Record<Tone, string> = {
  primary: "tp-btn-primary",
  secondary: "tp-btn-secondary",
  danger: "tp-btn-danger",
};

/**
 * Tasteful replacement for `window.confirm`: first click arms the action and
 * shows a different label; a second click (within `timeoutMs`) actually runs
 * the handler. Auto-resets on blur / timeout. Keeps full keyboard support.
 */
export function ConfirmButton({
  label,
  confirmLabel = "Click again to confirm",
  busyLabel,
  onConfirm,
  disabled = false,
  busy = false,
  tone = "danger",
  className,
  timeoutMs = 4000,
  ariaLabel,
  testId,
}: Props) {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const handleClick = useCallback(() => {
    if (disabled || busy) {
      return;
    }
    if (!armed) {
      setArmed(true);
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        setArmed(false);
        timerRef.current = null;
      }, timeoutMs);
      return;
    }
    clearTimer();
    setArmed(false);
    void onConfirm();
  }, [armed, busy, clearTimer, disabled, onConfirm, timeoutMs]);

  const handleBlur = useCallback(() => {
    if (armed) {
      clearTimer();
      setArmed(false);
    }
  }, [armed, clearTimer]);

  const visibleLabel = busy ? (busyLabel ?? label) : armed ? confirmLabel : label;

  return (
    <button
      type="button"
      onClick={handleClick}
      onBlur={handleBlur}
      disabled={disabled || busy}
      aria-busy={busy}
      aria-label={ariaLabel}
      data-testid={testId}
      data-armed={armed || undefined}
      className={`${toneClass[tone]} ${
        armed ? "ring-2 ring-offset-1 ring-[var(--tp-amber)]" : ""
      } ${className ?? ""}`}
    >
      {visibleLabel}
    </button>
  );
}
