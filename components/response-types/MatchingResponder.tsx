"use client";

import { useState } from "react";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import type { MatchingConfig } from "@/lib/response-types/types";
import { focusRing } from "@/lib/ui";

type Props = {
  pairs: Record<string, string>;
  disabled: boolean;
  config: MatchingConfig;
  onChange: (pairs: Record<string, string>) => void;
};

export function MatchingResponder({ pairs, disabled, config, onChange }: Props) {
  const t = useTranslations();
  const [activeLeftId, setActiveLeftId] = useState<string | null>(null);
  const left = config.left ?? [];
  const right = config.right ?? [];

  const handleLeftTap = (leftId: string) => {
    if (disabled) {
      return;
    }
    setActiveLeftId(leftId);
  };

  const handleRightTap = (rightId: string) => {
    if (disabled || !activeLeftId) {
      return;
    }
    const next = { ...pairs, [activeLeftId]: rightId };
    setActiveLeftId(null);
    onChange(next);
  };

  const clearPair = (leftId: string) => {
    if (disabled) {
      return;
    }
    const next = { ...pairs };
    delete next[leftId];
    onChange(next);
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2" data-testid="student-matching">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--tp-text-muted)]">
          {t("responseTypes.matching.leftColumn")}
        </p>
        <ul className="space-y-2">
          {left.map((item) => {
            const matchedRightId = pairs[item.id];
            const matchedRight = right.find((r) => r.id === matchedRightId);
            const isActive = activeLeftId === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => handleLeftTap(item.id)}
                  className={`w-full rounded-[var(--tp-radius-sm)] border px-3 py-2.5 text-left text-sm ${
                    isActive
                      ? "border-[var(--tp-accent)] bg-[var(--tp-accent-soft)]"
                      : "border-[var(--tp-border)] bg-[var(--tp-surface)]"
                  } ${focusRing}`}
                >
                  <span className="font-medium">{item.text}</span>
                  {matchedRight ? (
                    <span className="mt-1 block text-xs text-[var(--tp-text-secondary)]">
                      → {matchedRight.text}
                      <button
                        type="button"
                        className={`ml-2 underline ${focusRing}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          clearPair(item.id);
                        }}
                      >
                        {t("responseTypes.matching.clear")}
                      </button>
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--tp-text-muted)]">
          {t("responseTypes.matching.rightColumn")}
        </p>
        <ul className="space-y-2">
          {right.map((item) => {
            const pairedToLeft = Object.entries(pairs).find(([, r]) => r === item.id)?.[0];
            const isUsed = pairedToLeft !== undefined;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={
                    disabled || !activeLeftId || (isUsed && pairedToLeft !== activeLeftId)
                  }
                  onClick={() => handleRightTap(item.id)}
                  className={`w-full rounded-[var(--tp-radius-sm)] border px-3 py-2.5 text-left text-sm ${
                    isUsed
                      ? "border-[var(--tp-border)] bg-[var(--tp-bg-subtle)] text-[var(--tp-text-muted)]"
                      : "border-[var(--tp-border)] bg-[var(--tp-surface)]"
                  } ${focusRing}`}
                >
                  {item.text}
                </button>
              </li>
            );
          })}
        </ul>
        {activeLeftId ? (
          <p className="mt-2 text-xs text-[var(--tp-text-secondary)]">
            {t("responseTypes.matching.tapRight")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
