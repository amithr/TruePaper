"use client";

import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from "@floating-ui/react";
import { useEffect, useId, useRef, type MouseEvent } from "react";

import { EntityListRow } from "@/components/lists/EntityList";
import { OverflowMenu, type OverflowMenuItem } from "@/components/OverflowMenu";
import { LocaleLink as Link } from "@/lib/i18n/client";
import { avatarTintForForm, formInitial, lastRunAge } from "@/lib/form-library-meta";
import type { Form } from "@/lib/forms";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { focusRing, ui } from "@/lib/ui";

type DeliveryMode = "live" | "self_paced" | "hybrid";

type Props = {
  form: Form;
  questionCount: number;
  autogradeCount: number;
  lastRunAt: string | null;
  durationMinutes: number;
  noTimeLimit: boolean;
  deliveryMode: DeliveryMode;
  acceptLateSync: boolean;
  liveTeacherFeedbackEnabled: boolean;
  starting: boolean;
  menuItems: OverflowMenuItem[];
  openPopover: "start" | "menu" | null;
  onOpenPopoverChange: (next: "start" | "menu" | null) => void;
  onDurationChange: (minutes: number) => void;
  onNoTimeLimitChange: (enabled: boolean) => void;
  onDeliveryModeChange: (mode: DeliveryMode) => void;
  onAcceptLateSyncChange: (enabled: boolean) => void;
  onLiveTeacherFeedbackChange: (enabled: boolean) => void;
  onStart: () => void;
  onEdit: () => void;
};

const DELIVERY_MODES: DeliveryMode[] = ["live", "self_paced", "hybrid"];

function deliveryShortKey(
  mode: DeliveryMode,
): "deliveryLiveShort" | "deliverySelfPacedShort" | "deliveryHybridShort" {
  if (mode === "self_paced") {
    return "deliverySelfPacedShort";
  }
  if (mode === "hybrid") {
    return "deliveryHybridShort";
  }
  return "deliveryLiveShort";
}

function deliveryHelpKey(
  mode: DeliveryMode,
): "deliveryLiveHelp" | "deliverySelfPacedHelp" | "deliveryHybridHelp" {
  if (mode === "self_paced") {
    return "deliverySelfPacedHelp";
  }
  if (mode === "hybrid") {
    return "deliveryHybridHelp";
  }
  return "deliveryLiveHelp";
}

export function FormLibraryRow({
  form,
  questionCount,
  autogradeCount,
  lastRunAt,
  durationMinutes,
  noTimeLimit,
  deliveryMode,
  acceptLateSync,
  liveTeacherFeedbackEnabled,
  starting,
  menuItems,
  openPopover,
  onOpenPopoverChange,
  onDurationChange,
  onNoTimeLimitChange,
  onDeliveryModeChange,
  onAcceptLateSyncChange,
  onLiveTeacherFeedbackChange,
  onStart,
  onEdit,
}: Props) {
  const t = useTranslations();
  const title = form.title || t("common.untitledForm");
  const tint = avatarTintForForm(form.id);
  const startOpen = openPopover === "start";
  const menuOpen = openPopover === "menu";
  const startPanelId = useId();
  const startButtonRef = useRef<HTMLButtonElement>(null);
  const startPanelRef = useRef<HTMLDivElement>(null);

  const { refs, floatingStyles } = useFloating({
    open: startOpen,
    onOpenChange: (open) => onOpenPopoverChange(open ? "start" : null),
    placement: "bottom-end",
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    if (!startOpen) {
      return;
    }
    const onPointerDown = (event: globalThis.MouseEvent) => {
      const target = event.target as Node;
      if (startButtonRef.current?.contains(target) || startPanelRef.current?.contains(target)) {
        return;
      }
      onOpenPopoverChange(null);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenPopoverChange(null);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onOpenPopoverChange, startOpen]);

  const age = lastRunAge(lastRunAt);
  const lastRunLabel =
    age.kind === "never"
      ? t("formLibrary.lastRunNever")
      : age.kind === "today"
        ? t("formLibrary.lastRunToday")
        : age.kind === "days"
          ? t("formLibrary.lastRunDays", { n: age.n })
          : age.kind === "weeks"
            ? t("formLibrary.lastRunWeeks", { n: age.n })
            : age.kind === "months"
              ? t("formLibrary.lastRunMonths", { n: age.n })
              : t("formLibrary.lastRunYears", { n: age.n });

  const autogradeLabel = t("formLibrary.autogradeCoverage", {
    n: autogradeCount,
    total: questionCount,
  });
  const autogradeComplete = questionCount > 0 && autogradeCount >= questionCount;

  const modeLabel = t(`formLibrary.${deliveryShortKey(deliveryMode)}`).toLowerCase();
  const startSummary = noTimeLimit
    ? t("formLibrary.startSummaryNoLimit", { mode: modeLabel })
    : t("formLibrary.startSummaryTimed", { mode: modeLabel, minutes: durationMinutes });

  const onRowClick = (event: MouseEvent<HTMLLIElement>) => {
    if ((event.target as HTMLElement).closest("[data-row-action], a")) {
      return;
    }
    onOpenPopoverChange(null);
    onEdit();
  };

  return (
    <EntityListRow
      className="tp-entity-list-row--form"
      interactive
      onClick={onRowClick}
    >
      <span
        className="tp-entity-list-row__avatar tp-form-library-row__avatar"
        style={{ background: tint.bg, color: tint.text }}
        aria-hidden
      >
        {formInitial(title)}
      </span>

      <div className="tp-entity-list-row__heading tp-form-library-row__heading">
        <Link
          href={`/?form=${form.id}`}
          className={`tp-entity-list-row__title tp-form-library-row__title ${focusRing}`}
          onClick={() => onOpenPopoverChange(null)}
        >
          {title}
        </Link>
        <div className="tp-form-library-row__meta-line">
          <span>
            {questionCount === 1
              ? t("formLibrary.questionCountOne", { n: questionCount })
              : t("formLibrary.questionCountOther", { n: questionCount })}
          </span>
          <span className="tp-form-library-row__meta-sep" aria-hidden>
            ·
          </span>
          <span>{lastRunLabel}</span>
          <span className="tp-form-library-row__meta-sep" aria-hidden>
            ·
          </span>
          <span
            className={
              autogradeComplete
                ? "tp-form-library-row__autograde tp-form-library-row__autograde--complete"
                : "tp-form-library-row__autograde"
            }
          >
            {autogradeLabel}
          </span>
        </div>
      </div>

      <div className="tp-entity-list-row__actions tp-form-library-row__actions" data-row-action>
        <button
          type="button"
          data-row-action
          disabled={starting}
          // eslint-disable-next-line react-hooks/refs -- Floating UI callback ref setter
          ref={(node) => {
            startButtonRef.current = node;
            refs.setReference(node);
          }}
          aria-expanded={startOpen}
          aria-haspopup="dialog"
          aria-controls={startPanelId}
          onClick={(event) => {
            event.stopPropagation();
            onOpenPopoverChange(startOpen ? null : "start");
          }}
          className={`tp-form-library-row__start-pill ${focusRing} disabled:opacity-50`}
          aria-busy={starting}
        >
          <svg aria-hidden className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
          {starting ? t("common.starting") : t("common.start")}
        </button>

        <OverflowMenu
          label={t("formLibrary.moreActions")}
          items={menuItems}
          open={menuOpen}
          onOpenChange={(open) => onOpenPopoverChange(open ? "menu" : null)}
          showClose={false}
          className="tp-form-library-row__overflow"
        />
      </div>

      {startOpen ? (
        <FloatingPortal>
          <div
            id={startPanelId}
            ref={(node) => {
              startPanelRef.current = node;
              refs.setFloating(node);
            }}
            role="dialog"
            aria-label={t("formLibrary.startPopoverTitle")}
            className="tp-form-library-start-popover"
            style={floatingStyles}
            data-row-action
            onClick={(event) => event.stopPropagation()}
          >
            <div className="tp-form-library-start-popover__title">
              {t("formLibrary.startPopoverTitle")}
            </div>
            <div className="tp-form-library-start-popover__subtitle">
              {t("formLibrary.startPopoverSubtitle")}
            </div>

            <div className="tp-form-library-start-popover__duration">
              <label className="tp-form-library-start-popover__duration-label" htmlFor={`${startPanelId}-mins`}>
                {t("formLibrary.durationLabel")}
              </label>
              <input
                id={`${startPanelId}-mins`}
                type="number"
                min={5}
                max={480}
                value={durationMinutes}
                disabled={noTimeLimit}
                onChange={(e) => onDurationChange(Number(e.target.value) || 45)}
                aria-label={t("formLibrary.minutesAria")}
                className="tp-form-library-start-popover__minutes"
              />
              <span className="tp-form-library-start-popover__unit">{t("common.min")}</span>
              <label className="tp-form-library-start-popover__no-limit">
                <input
                  type="checkbox"
                  checked={noTimeLimit}
                  onChange={(e) => onNoTimeLimitChange(e.target.checked)}
                />
                <span>{t("common.noLimit")}</span>
              </label>
            </div>

            <div className="tp-form-library-start-popover__delivery">
              <div className="tp-form-library-start-popover__field-label" id={`${startPanelId}-delivery`}>
                {t("formLibrary.deliveryMode")}
              </div>
              <div
                className="tp-form-library-segments"
                role="radiogroup"
                aria-labelledby={`${startPanelId}-delivery`}
              >
                {DELIVERY_MODES.map((mode) => (
                  <button
                    key={mode}
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
                ))}
              </div>
              <p className="tp-form-library-start-popover__help">
                {t(`formLibrary.${deliveryHelpKey(deliveryMode)}`)}
              </p>
            </div>

            <label className="tp-form-library-start-popover__late-sync">
              <input
                type="checkbox"
                checked={acceptLateSync}
                onChange={(e) => onAcceptLateSyncChange(e.target.checked)}
              />
              <span>
                {t("formLibrary.acceptLateSyncLabel")}{" "}
                <span className="tp-form-library-start-popover__late-sync-hint">
                  — {t("formLibrary.acceptLateSyncHint")}
                </span>
              </span>
            </label>

            <label className="tp-form-library-start-popover__late-sync">
              <input
                type="checkbox"
                checked={liveTeacherFeedbackEnabled}
                onChange={(e) => onLiveTeacherFeedbackChange(e.target.checked)}
              />
              <span>
                {t("formLibrary.liveFeedbackLabel")}{" "}
                <span className="tp-form-library-start-popover__late-sync-hint">
                  — {t("formLibrary.liveFeedbackHint")}
                </span>
              </span>
            </label>

            <button
              type="button"
              disabled={starting}
              onClick={() => {
                onOpenPopoverChange(null);
                onStart();
              }}
              className={`${ui.btnPrimary} tp-form-library-start-popover__cta disabled:opacity-50`}
              aria-busy={starting}
            >
              <svg aria-hidden className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              {starting ? t("common.starting") : t("formLibrary.startCta", { summary: startSummary })}
            </button>
          </div>
        </FloatingPortal>
      ) : null}
    </EntityListRow>
  );
}
