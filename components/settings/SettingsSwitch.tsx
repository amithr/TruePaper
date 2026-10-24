"use client";

import { Lock } from "lucide-react";

import { useTranslations } from "@/lib/i18n/I18nProvider";

type Props = {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange?: (next: boolean) => void;
  /** Documents a hard guard: rendered on, disabled, with an "Always on" pill. */
  locked?: boolean;
  /** Greyed out and inert (e.g. late sync outside Live mode). */
  dimmed?: boolean;
};

/** A labelled row with an accessible switch (role="switch", keyboard toggles). */
export function SettingsSwitch({ id, label, hint, checked, onChange, locked = false, dimmed = false }: Props) {
  const t = useTranslations();
  const inert = locked || dimmed;
  return (
    <div className="tp-settings-row" data-dimmed={dimmed ? "true" : undefined}>
      <div>
        <p className="tp-settings-row__label" id={`${id}-label`}>
          {label}
          {locked ? (
            <span className="tp-settings-lock">
              <Lock aria-hidden className="h-3 w-3" />
              {t("settings.defaults.alwaysOn")}
            </span>
          ) : null}
        </p>
        <p className="tp-settings-row__hint">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        disabled={inert}
        data-locked={locked ? "true" : undefined}
        className="tp-switch"
        onClick={() => onChange?.(!checked)}
      >
        <span className="tp-switch__knob" aria-hidden />
      </button>
    </div>
  );
}
