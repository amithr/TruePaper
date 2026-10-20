"use client";

import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useFloating,
} from "@floating-ui/react";
import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from "react";
import { toast } from "sonner";

import { EntityListRow } from "@/components/lists/EntityList";
import { OverflowMenu, type OverflowMenuItem } from "@/components/OverflowMenu";
import { LocaleLink as Link } from "@/lib/i18n/client";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { avatarTintForForm, formInitial, lastRunAge } from "@/lib/form-library-meta";
import { buildFormStartUrl } from "@/lib/form-start-link";
import type { Form } from "@/lib/forms";
import { useLocale, useTranslations } from "@/lib/i18n/I18nProvider";
import { focusRing, ui } from "@/lib/ui";

type DeliveryMode = "live" | "self_paced" | "hybrid";

export type FormLibraryPopover = "start" | "start-link" | "menu";

type Props = {
  form: Form;
  questionCount: number;
  autogradeCount: number;
  lastRunAt: string | null;
  origin: string;
  durationMinutes: number;
  noTimeLimit: boolean;
  deliveryMode: DeliveryMode;
  acceptLateSync: boolean;
  liveTeacherFeedbackEnabled: boolean;
  starting: boolean;
  menuItems: OverflowMenuItem[];
  openPopover: FormLibraryPopover | null;
  onOpenPopoverChange: (next: FormLibraryPopover | null) => void;
  onDurationChange: (minutes: number) => void;
  onNoTimeLimitChange: (enabled: boolean) => void;
  onDeliveryModeChange: (mode: DeliveryMode) => void;
  onAcceptLateSyncChange: (enabled: boolean) => void;
  onLiveTeacherFeedbackChange: (enabled: boolean) => void;
  onStart: () => void;
  onEdit: () => void;
};

const DELIVERY_MODES: DeliveryMode[] = ["live", "self_paced", "hybrid"];

const DURATION_PRESETS = [30, 45, 60, 90];

const START_SETTINGS_EXPANDED_KEY = "truepaper_start_settings_expanded";

function readStartSettingsExpanded(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(START_SETTINGS_EXPANDED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeStartSettingsExpanded(expanded: boolean): void {
  try {
    window.localStorage.setItem(START_SETTINGS_EXPANDED_KEY, expanded ? "1" : "0");
  } catch {
    /* per-browser convenience only */
  }
}

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
  origin,
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
  const locale = useLocale();
  const title = form.title || t("common.untitledForm");
  const tint = avatarTintForForm(form.id);
  const startOpen = openPopover === "start" || openPopover === "start-link";
  const linkTab = openPopover === "start-link";
  const menuOpen = openPopover === "menu";
  const startPanelId = useId();
  const startButtonRef = useRef<HTMLButtonElement>(null);
  const startPanelRef = useRef<HTMLDivElement>(null);

  const startLinkUrl = useMemo(
    () =>
      buildFormStartUrl(origin, locale, form.id, {
        durationMinutes,
        noTimeLimit,
        deliveryMode,
        acceptLateSync,
      }),
    [origin, locale, form.id, durationMinutes, noTimeLimit, deliveryMode, acceptLateSync],
  );
  // Settings stay collapsed ("start like last time") unless this teacher keeps them open.
  const [settingsPref, setSettingsPref] = useState(readStartSettingsExpanded);
  const settingsExpanded = settingsPref || linkTab;
  const toggleSettings = () => {
    const next = !settingsExpanded;
    setSettingsPref(next);
    writeStartSettingsExpanded(next);
    if (!next && linkTab) {
      onOpenPopoverChange("start");
    }
  };
  const [customDurationChosen, setCustomDurationChosen] = useState(false);
  const customDuration =
    !noTimeLimit && (customDurationChosen || !DURATION_PRESETS.includes(durationMinutes));
  const customInputRef = useRef<HTMLInputElement>(null);

  // One-time attention pulse on Copy start link when opened from the ⋯ menu.
  const wasStartOpenRef = useRef(false);
  const [linkAttention, setLinkAttention] = useState(false);
  useEffect(() => {
    const wasOpen = wasStartOpenRef.current;
    wasStartOpenRef.current = startOpen;
    if (wasOpen || openPopover !== "start-link") {
      return;
    }
    setLinkAttention(true);
    const timer = window.setTimeout(() => setLinkAttention(false), 1200);
    return () => window.clearTimeout(timer);
  }, [openPopover, startOpen]);

  const { refs, floatingStyles, isPositioned } = useFloating({
    open: startOpen,
    onOpenChange: (open) => onOpenPopoverChange(open ? "start" : null),
    placement: "bottom-end",
    middleware: [
      offset(8),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      // Expanded settings can outgrow a phone screen: cap to the visible space and scroll inside.
      size({
        padding: 8,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(220, availableHeight)}px`;
        },
      }),
    ],
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
  const startHeadline = startSummary.charAt(0).toLocaleUpperCase(locale) + startSummary.slice(1);
  // Late sync only changes anything for Live (self-paced / hybrid always sync after close).
  const startExtras = [
    deliveryMode === "live"
      ? acceptLateSync
        ? t("formLibrary.startPopover.lateSyncOn")
        : t("formLibrary.startPopover.lateSyncOff")
      : null,
    liveTeacherFeedbackEnabled ? t("formLibrary.startPopover.feedbackOn") : null,
  ].filter((part): part is string => part !== null);

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
            aria-label={t("formLibrary.startPopover.title")}
            className="tp-form-library-start-popover"
            // Hidden for the first frame, before Floating UI has measured, so it never flashes at 0,0.
            style={{ ...floatingStyles, visibility: isPositioned ? "visible" : "hidden" }}
            data-row-action
            onClick={(event) => event.stopPropagation()}
          >
            <p className="tp-form-library-start-popover__summary" data-testid="start-summary">
              {startHeadline}
            </p>
            {startExtras.length > 0 ? (
              <p className="tp-form-library-start-popover__extras">{startExtras.join(" · ")}</p>
            ) : null}

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
              {starting ? t("common.starting") : t("formLibrary.startPopover.startCta")}
            </button>

            <button
              type="button"
              aria-expanded={settingsExpanded}
              aria-controls={`${startPanelId}-settings`}
              onClick={toggleSettings}
              className={`tp-form-library-start-popover__toggle ${focusRing}`}
            >
              {settingsExpanded
                ? t("formLibrary.startPopover.hideSettings")
                : t("formLibrary.startPopover.changeSettings")}
              <svg
                aria-hidden
                className="h-3.5 w-3.5"
                data-open={settingsExpanded ? "true" : undefined}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {settingsExpanded ? (
              <div id={`${startPanelId}-settings`} className="tp-form-library-start-popover__settings">
                <div className="tp-form-library-start-popover__field">
                  <div
                    className="tp-form-library-start-popover__field-label"
                    id={`${startPanelId}-duration`}
                  >
                    {t("formLibrary.durationLabel")}
                  </div>
                  <div
                    className="tp-form-library-chips"
                    role="radiogroup"
                    aria-labelledby={`${startPanelId}-duration`}
                  >
                    {DURATION_PRESETS.map((minutes) => {
                      const active = !noTimeLimit && !customDuration && durationMinutes === minutes;
                      return (
                        <button
                          key={minutes}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          data-active={active ? "true" : undefined}
                          className={`tp-form-library-chip ${focusRing}`}
                          onClick={() => {
                            setCustomDurationChosen(false);
                            onNoTimeLimitChange(false);
                            onDurationChange(minutes);
                          }}
                        >
                          {t("formLibrary.startPopover.minutesChip", { n: minutes })}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={noTimeLimit}
                      data-active={noTimeLimit ? "true" : undefined}
                      className={`tp-form-library-chip ${focusRing}`}
                      onClick={() => {
                        setCustomDurationChosen(false);
                        onNoTimeLimitChange(true);
                      }}
                    >
                      {t("common.noLimit")}
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={customDuration}
                      data-active={customDuration ? "true" : undefined}
                      className={`tp-form-library-chip ${focusRing}`}
                      onClick={() => {
                        setCustomDurationChosen(true);
                        onNoTimeLimitChange(false);
                        window.setTimeout(() => customInputRef.current?.focus(), 0);
                      }}
                    >
                      {t("formLibrary.startPopover.durationCustom")}
                    </button>
                  </div>
                  {customDuration ? (
                    <div className="tp-form-library-start-popover__custom">
                      <input
                        ref={customInputRef}
                        type="number"
                        min={5}
                        max={480}
                        value={durationMinutes}
                        onChange={(e) => onDurationChange(Number(e.target.value) || 45)}
                        aria-label={t("formLibrary.minutesAria")}
                        className="tp-form-library-start-popover__minutes"
                      />
                      <span className="tp-form-library-start-popover__unit">{t("common.min")}</span>
                    </div>
                  ) : null}
                </div>

                <div className="tp-form-library-start-popover__field">
                  <div
                    className="tp-form-library-start-popover__field-label"
                    id={`${startPanelId}-delivery`}
                  >
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

                {deliveryMode === "live" ? (
                  <label className="tp-form-library-start-popover__late-sync">
                    <input
                      type="checkbox"
                      checked={acceptLateSync}
                      onChange={(e) => onAcceptLateSyncChange(e.target.checked)}
                    />
                    <span>{t("formLibrary.acceptLateSyncLabel")}</span>
                  </label>
                ) : null}

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

                <div className="tp-form-library-start-popover__link">
                  <button
                    type="button"
                    disabled={!startLinkUrl}
                    data-attn={linkAttention ? "true" : undefined}
                    onClick={() => {
                      const summary = startSummary;
                      void copyToClipboard(startLinkUrl).then((ok) => {
                        if (ok) {
                          toast.success(t("formLibrary.startLink.copiedSummary", { summary }));
                        }
                      });
                      onOpenPopoverChange(null);
                    }}
                    className={`tp-form-library-start-popover__copy-link ${focusRing} disabled:opacity-50`}
                  >
                    <svg
                      aria-hidden
                      className="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
                    </svg>
                    {t("formLibrary.startPopover.copyLink")}
                  </button>
                  <p className="tp-form-library-start-popover__link-hint">
                    {t("formLibrary.startPopover.copyLinkHint")}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </FloatingPortal>
      ) : null}
    </EntityListRow>
  );
}
