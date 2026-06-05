"use client";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import type { LabellingConfig } from "@/lib/response-types/types";
import { focusRing } from "@/lib/ui";

type Props = {
  assignments: Record<string, string>;
  disabled: boolean;
  config: LabellingConfig;
  onChange: (assignments: Record<string, string>) => void;
};

export function LabellingResponder({ assignments, disabled, config, onChange }: Props) {
  const t = useTranslations();
  const zones = config.zones ?? [];
  const terms = config.terms ?? [];

  const handleAssign = (zoneId: string, termId: string) => {
    if (disabled) {
      return;
    }
    onChange({ ...assignments, [zoneId]: termId });
  };

  return (
    <div className="space-y-3" data-testid="student-labelling">
      {zones.map((zone) => (
        <label key={zone.id} className="block text-sm">
          <span className="mb-1 block font-medium text-[var(--tp-text)]">{zone.text}</span>
          <select
            value={assignments[zone.id] ?? ""}
            disabled={disabled}
            onChange={(event) => handleAssign(zone.id, event.target.value)}
            className={`tp-input min-h-11 w-full ${focusRing}`}
          >
            <option value="">{t("responseTypes.labelling.choose")}</option>
            {terms.map((term) => (
              <option key={term.id} value={term.id}>
                {term.text}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
