"use client";

import { useId, useMemo, type ChangeEvent } from "react";

const LENGTH = 6;
const ALLOWED = /[^0-9A-Z]/g;

type Props = {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  "aria-label"?: string;
  id?: string;
};

/**
 * Class join code field. A single text input (with placeholder "ABCD12") sits
 * invisibly on top of six animated cells; the cells render the current value.
 *
 * This keeps the OTP visual while preserving the existing legacy locator
 * `getByPlaceholder("ABCD12")` used by the e2e suite.
 */
export function JoinCodeInput({
  value,
  onChange,
  disabled = false,
  autoFocus = false,
  "aria-label": ariaLabel = "Class join code",
  id,
}: Props) {
  const generatedId = useId();
  const inputId = id ?? `${generatedId}-join-code`;

  const cells = useMemo(() => {
    const padded = value.padEnd(LENGTH, " ").slice(0, LENGTH);
    return Array.from(padded);
  }, [value]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value.toUpperCase().replace(ALLOWED, "");
    onChange(raw.slice(0, LENGTH));
  };

  return (
    <div className="relative inline-block">
      <div className="tp-join-code" aria-hidden>
        {cells.map((c, i) => {
          const filled = c.trim().length > 0;
          const isCursor = i === Math.min(value.length, LENGTH - 1) && !disabled;
          return (
            <div
              key={i}
              className="tp-join-code-cell"
              data-filled={filled || undefined}
              data-cursor={isCursor || undefined}
              style={{
                color: filled ? "var(--tp-text)" : "transparent",
                background: filled ? "var(--tp-accent-soft)" : "var(--tp-surface)",
                borderColor: filled
                  ? "var(--tp-accent)"
                  : isCursor
                    ? "var(--tp-accent-ring)"
                    : "var(--tp-border-strong)",
                transition:
                  "background 160ms var(--tp-ease-soft), border-color 160ms var(--tp-ease-soft), color 160ms",
              }}
            >
              {c.trim() || "·"}
            </div>
          );
        })}
      </div>
      <input
        id={inputId}
        type="text"
        inputMode="text"
        autoComplete="one-time-code"
        spellCheck={false}
        autoFocus={autoFocus}
        disabled={disabled}
        maxLength={LENGTH}
        placeholder="ABCD12"
        aria-label={ariaLabel}
        value={value}
        onChange={handleChange}
        className="absolute inset-0 h-full w-full cursor-text rounded-[var(--tp-radius-sm)] border-0 bg-transparent p-0 text-transparent caret-transparent placeholder:text-transparent focus:outline-none"
      />
    </div>
  );
}
