"use client";

import { ChevronDown, X } from "lucide-react";
import { useId } from "react";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import type { MatchingConfig } from "@/lib/response-types/types";
import { focusRing } from "@/lib/ui";

type Props = {
  pairs: Record<string, string>;
  disabled: boolean;
  config: MatchingConfig;
  onChange: (pairs: Record<string, string>) => void;
};

/** A, B, … Z, then A2, B2, … for very long lists. */
export function matchingLetter(index: number): string {
  const letter = String.fromCharCode(65 + (index % 26));
  const round = Math.floor(index / 26);
  return round === 0 ? letter : `${letter}${round + 1}`;
}

/**
 * Exam-paper matching: definitions are a lettered key (A, B, C…) and each numbered
 * term picks a letter. A native <select> per term works with keyboard, screen
 * readers and phone pickers (which show long definitions in full) — no tapping
 * back and forth between two long columns.
 */
export function MatchingResponder({ pairs, disabled, config, onChange }: Props) {
  const t = useTranslations();
  const uid = useId();
  const left = config.left ?? [];
  const right = config.right ?? [];

  const letterByRightId = new Map(right.map((item, index) => [item.id, matchingLetter(index)]));
  const termNumberByLeftId = new Map(left.map((item, index) => [item.id, index + 1]));
  const leftIdByRightId = new Map<string, string>();
  for (const [leftId, rightId] of Object.entries(pairs)) {
    if (rightId && termNumberByLeftId.has(leftId)) {
      leftIdByRightId.set(rightId, leftId);
    }
  }
  const matchedCount = left.filter((item) => Boolean(pairs[item.id])).length;

  const choose = (leftId: string, rightId: string) => {
    if (disabled) {
      return;
    }
    const next = { ...pairs };
    if (!rightId) {
      delete next[leftId];
      onChange(next);
      return;
    }
    // One definition per term: picking a used definition moves it here.
    for (const [otherLeft, otherRight] of Object.entries(next)) {
      if (otherRight === rightId && otherLeft !== leftId) {
        delete next[otherLeft];
      }
    }
    next[leftId] = rightId;
    onChange(next);
  };

  return (
    <div className="tp-matching" data-testid="student-matching">
      <p
        className="tp-matching__progress"
        role="status"
        data-complete={left.length > 0 && matchedCount === left.length ? "true" : undefined}
      >
        {t("responseTypes.matching.progress", { matched: matchedCount, total: left.length })}
      </p>

      <div className="tp-matching__layout">
        <section aria-labelledby={`${uid}-terms`}>
          <p id={`${uid}-terms`} className="tp-matching__heading">
            {t("responseTypes.matching.leftColumn")}
          </p>
          <ol className="tp-matching__terms">
            {left.map((item, index) => {
              const rightId = pairs[item.id] ?? "";
              const matched = right.find((r) => r.id === rightId);
              const selectId = `${uid}-${item.id}`;
              return (
                <li
                  key={item.id}
                  className="tp-matching__term"
                  data-matched={matched ? "true" : undefined}
                  data-testid={`matching-term-${item.id}`}
                >
                  <span className="tp-matching__number" aria-hidden>
                    {index + 1}
                  </span>
                  <div className="tp-matching__term-body">
                    <label htmlFor={selectId} className="tp-matching__term-text">
                      {item.text}
                    </label>
                    <div className="tp-matching__picker">
                      {/* Styled field shows the full, wrapping choice; the native select sits
                          invisibly on top so pickers, keyboard and screen readers still work. */}
                      <div
                        className="tp-matching__field"
                        data-empty={matched ? undefined : "true"}
                        data-disabled={disabled ? "true" : undefined}
                      >
                        <span className="tp-matching__field-display" aria-hidden>
                          {matched ? (
                            <>
                              <span className="tp-matching__letter">
                                {letterByRightId.get(matched.id)}
                              </span>
                              <span>{matched.text}</span>
                            </>
                          ) : (
                            t("responseTypes.matching.choose")
                          )}
                        </span>
                        {disabled ? null : (
                          <ChevronDown aria-hidden className="tp-matching__chevron h-4 w-4" />
                        )}
                        <select
                          id={selectId}
                          value={rightId}
                          disabled={disabled}
                          onChange={(event) => choose(item.id, event.target.value)}
                          className="tp-matching__select"
                        >
                          <option value="">{t("responseTypes.matching.choose")}</option>
                          {right.map((option, optionIndex) => {
                            const usedBy = leftIdByRightId.get(option.id);
                            const usedElsewhere = usedBy !== undefined && usedBy !== item.id;
                            return (
                              <option key={option.id} value={option.id}>
                                {`${matchingLetter(optionIndex)}. ${option.text}`}
                                {usedElsewhere
                                  ? ` — ${t("responseTypes.matching.usedBy", {
                                      n: termNumberByLeftId.get(usedBy) ?? 0,
                                    })}`
                                  : ""}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      {matched && !disabled ? (
                        <button
                          type="button"
                          onClick={() => choose(item.id, "")}
                          className={`tp-matching__clear ${focusRing}`}
                          aria-label={t("responseTypes.matching.clearFor", { term: item.text })}
                        >
                          <X aria-hidden className="h-4 w-4" />
                        </button>
                      ) : disabled ? null : (
                        // Same width as the clear button so every field lines up.
                        <span className="tp-matching__clear-spacer" aria-hidden />
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section aria-labelledby={`${uid}-key`} className="tp-matching__key-wrap">
          <p id={`${uid}-key`} className="tp-matching__heading">
            {t("responseTypes.matching.rightColumn")}
          </p>
          <ul className="tp-matching__key">
            {right.map((item, index) => {
              const usedBy = leftIdByRightId.get(item.id);
              return (
                <li
                  key={item.id}
                  className="tp-matching__definition"
                  data-used={usedBy ? "true" : undefined}
                >
                  <span className="tp-matching__letter">{matchingLetter(index)}</span>
                  <span className="min-w-0 flex-1">{item.text}</span>
                  {usedBy ? (
                    <span className="tp-matching__used">
                      {t("responseTypes.matching.usedByShort", {
                        n: termNumberByLeftId.get(usedBy) ?? 0,
                      })}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
