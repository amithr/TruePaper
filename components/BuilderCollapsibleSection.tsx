"use client";

import { useState, type ReactNode } from "react";

import { focusRing } from "@/lib/ui";

type Props = {
  title: string;
  children: ReactNode;
  /** Open by default when the section already has content worth showing. */
  defaultOpen?: boolean;
  hint?: ReactNode;
};

/** Collapsible secondary panel for builder cards (image, scoring, answer settings). */
export function BuilderCollapsibleSection({
  title,
  children,
  defaultOpen = false,
  hint,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <details
      className="group rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-bg-subtle)] px-3 py-2"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      data-testid="builder-collapsible-section"
    >
      <summary
        className={`cursor-pointer list-none text-sm font-medium text-[var(--tp-text-secondary)] marker:content-none [&::-webkit-details-marker]:hidden ${focusRing}`}
      >
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="text-[var(--tp-text-muted)] transition-transform group-open:rotate-90"
          >
            ▸
          </span>
          {title}
          {hint}
        </span>
      </summary>
      <div className="mt-3 space-y-3 border-t border-[var(--tp-border)] pt-3">{children}</div>
    </details>
  );
}
