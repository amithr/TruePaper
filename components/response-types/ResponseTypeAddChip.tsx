"use client";

import { HoverTooltip } from "@/components/HoverTooltip";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import {
  responseTypeDescriptionI18nKey,
  type ResponseTypeMeta,
} from "@/lib/response-types/registry";
import { ui } from "@/lib/ui";

type Props = {
  typeMeta: ResponseTypeMeta;
  label: string;
  isAdding: boolean;
  disabled: boolean;
  onAdd: () => void;
};

function AddIcon() {
  return (
    <svg
      aria-hidden
      className="tp-response-type-add__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

/** Builder chip: add a question of the given response type, with a descriptive tooltip. */
export function ResponseTypeAddChip({
  typeMeta,
  label,
  isAdding,
  disabled,
  onAdd,
}: Props) {
  const t = useTranslations();
  const description = t(responseTypeDescriptionI18nKey(typeMeta));
  const addLabel = t("home.builder.addQuestionType", { type: label });

  return (
    <HoverTooltip text={description} placement="top">
      <button
        type="button"
        onClick={onAdd}
        disabled={disabled}
        aria-busy={isAdding}
        aria-label={addLabel}
        className={`tp-response-type-add ${ui.btnSecondary}`}
      >
        {isAdding ? (
          <>
            <span
              className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80"
              aria-hidden
            />
            <span>{t("home.builder.addingQuestion")}</span>
          </>
        ) : (
          <>
            <AddIcon />
            <span>{label}</span>
          </>
        )}
      </button>
    </HoverTooltip>
  );
}
