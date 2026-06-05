"use client";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import { focusRing } from "@/lib/ui";

type Props = {
  id: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit?: () => void;
};

export function ShortAnswerResponder({ id, value, disabled, onChange, onSubmit }: Props) {
  const t = useTranslations();

  return (
    <input
      id={id}
      type="text"
      autoComplete="off"
      spellCheck
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && onSubmit) {
          event.preventDefault();
          onSubmit();
        }
      }}
      placeholder={t("responseTypes.shortAnswer.placeholder")}
      className={`tp-input min-h-11 w-full ${focusRing}`}
      data-testid="student-short-answer"
    />
  );
}
