"use client";

import { ChevronDown, ChevronUp } from "lucide-react";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import type { OrderingConfig } from "@/lib/response-types/types";
import { focusRing } from "@/lib/ui";

type Props = {
  order: string[];
  disabled: boolean;
  config: OrderingConfig;
  onChange: (order: string[]) => void;
};

function resolveOrder(order: string[], items: OrderingConfig["items"]): string[] {
  const ids = items.map((i) => i.id);
  const base = order.length > 0 ? order.filter((id) => ids.includes(id)) : [...ids];
  for (const id of ids) {
    if (!base.includes(id)) {
      base.push(id);
    }
  }
  return base;
}

export function OrderingResponder({ order, disabled, config, onChange }: Props) {
  const t = useTranslations();
  const items = config.items ?? [];
  const itemById = Object.fromEntries(items.map((i) => [i.id, i]));
  const resolved = resolveOrder(order, items);

  const move = (index: number, direction: -1 | 1) => {
    if (disabled) {
      return;
    }
    const next = [...resolved];
    const target = index + direction;
    if (target < 0 || target >= next.length) {
      return;
    }
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <ol className="space-y-2" data-testid="student-ordering">
      {resolved.map((id, index) => {
        const item = itemById[id];
        if (!item) {
          return null;
        }
        return (
          <li
            key={id}
            className="flex items-center gap-2 rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-[var(--tp-surface)] px-3 py-2"
          >
            <span className="w-6 shrink-0 text-sm font-semibold text-[var(--tp-text-muted)]">
              {index + 1}.
            </span>
            <span className="min-w-0 flex-1 text-sm">{item.text}</span>
            <div className="flex shrink-0 flex-col">
              <button
                type="button"
                disabled={disabled || index === 0}
                onClick={() => move(index, -1)}
                aria-label={t("responseTypes.ordering.moveUp")}
                className={`min-h-9 min-w-9 p-1 ${focusRing}`}
              >
                <ChevronUp className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                disabled={disabled || index === resolved.length - 1}
                onClick={() => move(index, 1)}
                aria-label={t("responseTypes.ordering.moveDown")}
                className={`min-h-9 min-w-9 p-1 ${focusRing}`}
              >
                <ChevronDown className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
