"use client";

import { StudentExamTextarea } from "@/components/StudentExamTextarea";
import type { ExtendedWrittenConfig } from "@/lib/response-types/types";
import { countWords } from "@/lib/response-types/answers";
import { useTranslations } from "@/lib/i18n/I18nProvider";

type Props = {
  id: string;
  value: string;
  disabled: boolean;
  protect: boolean;
  config: ExtendedWrittenConfig;
  onChange: (value: string) => void;
};

export function ExtendedWrittenResponder({
  id,
  value,
  disabled,
  protect,
  config,
  onChange,
}: Props) {
  const t = useTranslations();
  const words = countWords(value);
  const chars = value.length;
  const showWords = config.showCount !== "chars";
  const countLabel = showWords
    ? t("responseTypes.extendedWritten.wordCount", { count: words })
    : t("responseTypes.extendedWritten.charCount", { count: chars });

  let hint = "";
  if (config.minWords && words < config.minWords) {
    hint = t("responseTypes.extendedWritten.belowMin", { min: config.minWords });
  } else if (config.targetWords && words < config.targetWords) {
    hint = t("responseTypes.extendedWritten.belowTarget", { target: config.targetWords });
  }

  return (
    <div className="space-y-2">
      <StudentExamTextarea
        id={id}
        rows={8}
        value={value}
        disabled={disabled}
        protect={protect}
        onValueChange={onChange}
        placeholder={t("responseTypes.extendedWritten.placeholder")}
        className="tp-input tp-exam-textarea min-h-[12rem]"
      />
      <p className="flex flex-wrap items-center gap-2 text-xs text-[var(--tp-text-muted)]" aria-live="polite">
        <span>{countLabel}</span>
        {hint ? <span className="text-[var(--tp-text-secondary)]">{hint}</span> : null}
      </p>
    </div>
  );
}
