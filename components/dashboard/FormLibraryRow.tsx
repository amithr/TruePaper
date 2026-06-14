"use client";

import { LocaleLink as Link } from "@/lib/i18n/client";

import { HoverTooltip } from "@/components/HoverTooltip";
import { EntityListRow } from "@/components/lists/EntityList";
import { OverflowMenu, type OverflowMenuItem } from "@/components/OverflowMenu";
import type { Form } from "@/lib/forms";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { focusRing, ui } from "@/lib/ui";

type DeliveryMode = "live" | "self_paced" | "hybrid";

type Props = {
  form: Form;
  questionCount: number;
  durationMinutes: number;
  noTimeLimit: boolean;
  deliveryMode: DeliveryMode;
  starting: boolean;
  menuItems: OverflowMenuItem[];
  onDurationChange: (minutes: number) => void;
  onNoTimeLimitChange: (enabled: boolean) => void;
  onDeliveryModeChange: (mode: DeliveryMode) => void;
  onStart: () => void;
};

const DELIVERY_MODES: DeliveryMode[] = ["live", "self_paced", "hybrid"];

function deliveryShortKey(mode: DeliveryMode): "deliveryLiveShort" | "deliverySelfPacedShort" | "deliveryHybridShort" {
  if (mode === "self_paced") {
    return "deliverySelfPacedShort";
  }
  if (mode === "hybrid") {
    return "deliveryHybridShort";
  }
  return "deliveryLiveShort";
}

function deliveryTooltipKey(
  mode: DeliveryMode,
): "deliveryLiveTooltip" | "deliverySelfPacedTooltip" | "deliveryHybridTooltip" {
  if (mode === "self_paced") {
    return "deliverySelfPacedTooltip";
  }
  if (mode === "hybrid") {
    return "deliveryHybridTooltip";
  }
  return "deliveryLiveTooltip";
}

function formInitial(title: string): string {
  const trimmed = title.trim();
  return (trimmed.charAt(0) || "F").toUpperCase();
}

export function FormLibraryRow({
  form,
  questionCount,
  durationMinutes,
  noTimeLimit,
  deliveryMode,
  starting,
  menuItems,
  onDurationChange,
  onNoTimeLimitChange,
  onDeliveryModeChange,
  onStart,
}: Props) {
  const t = useTranslations();
  const title = form.title || t("common.untitledForm");

  return (
    <EntityListRow className="tp-entity-list-row--form">
      <div className="tp-entity-list-row__primary">
        <span className="tp-entity-list-row__avatar" aria-hidden>
          {formInitial(title)}
        </span>
        <div className="tp-entity-list-row__heading">
          <Link
            href={`/?form=${form.id}`}
            className={`tp-entity-list-row__title ${focusRing}`}
          >
            {title}
          </Link>
          <span className="tp-entity-list-row__meta">
            {questionCount === 1
              ? t("formLibrary.questionCountOne", { n: questionCount })
              : t("formLibrary.questionCountOther", { n: questionCount })}
          </span>
        </div>
      </div>

      <div className="tp-entity-list-row__content">
        <div className="tp-form-library-setup">
          <div className="tp-form-library-setup__duration">
            <label className="tp-form-library-setup__duration-label">
              <span className="tp-form-library-setup__field-label">{t("formLibrary.durationLabel")}</span>
              <span className="tp-form-library-setup__duration-inputs">
                <input
                  type="number"
                  min={5}
                  max={480}
                  value={durationMinutes}
                  onChange={(e) => onDurationChange(Number(e.target.value) || 45)}
                  disabled={noTimeLimit}
                  aria-label={t("formLibrary.minutesAria")}
                  className="tp-form-library-setup__minutes"
                />
                <span className="tp-form-library-setup__suffix">{t("common.min")}</span>
              </span>
            </label>
            <label className="tp-form-library-setup__no-limit">
              <input
                type="checkbox"
                checked={noTimeLimit}
                onChange={(e) => onNoTimeLimitChange(e.target.checked)}
              />
              <span>{t("common.noLimit")}</span>
            </label>
          </div>

          <div className="tp-form-library-setup__delivery">
            <span className="tp-form-library-setup__field-label" id={`delivery-label-${form.id}`}>
              {t("formLibrary.deliveryMode")}
            </span>
            <div
              className="tp-form-library-segments"
              role="radiogroup"
              aria-labelledby={`delivery-label-${form.id}`}
            >
              {DELIVERY_MODES.map((mode) => (
                <HoverTooltip
                  key={mode}
                  text={t(`formLibrary.${deliveryTooltipKey(mode)}`)}
                  className="tp-form-library-segment-wrap"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={deliveryMode === mode}
                    aria-label={t(`formLibrary.${deliveryShortKey(mode)}`)}
                    className="tp-form-library-segment"
                    data-active={deliveryMode === mode ? "true" : undefined}
                    onClick={() => onDeliveryModeChange(mode)}
                  >
                    {t(`formLibrary.${deliveryShortKey(mode)}`)}
                  </button>
                </HoverTooltip>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="tp-entity-list-row__actions">
        <button
          type="button"
          disabled={starting}
          onClick={onStart}
          className={`${ui.btnPrimary} tp-form-library-row__start disabled:opacity-50`}
          aria-busy={starting}
        >
          <svg aria-hidden className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
          {starting ? t("common.starting") : t("common.start")}
        </button>
        <Link
          href={`/?form=${form.id}`}
          className={`${ui.btnSecondary} tp-entity-list-row__ghost-btn tp-form-library-row__edit ${focusRing}`}
        >
          {t("common.edit")}
        </Link>
        <OverflowMenu label={t("formLibrary.moreActions")} items={menuItems} />
      </div>
    </EntityListRow>
  );
}
