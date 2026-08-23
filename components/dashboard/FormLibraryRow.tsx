"use client";

import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
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
  const [linkBase, linkQuery = ""] = startLinkUrl.split("?");
  const linkParams = useMemo(
    () =>
      linkQuery
        ? linkQuery.split("&").map((pair) => {
            const eq = pair.indexOf("=");
            return [pair.slice(0, eq), pair.slice(eq + 1)] as const;
          })
        : [],
    [linkQuery],
  );

  // Flash query params that changed while the Get link tab is visible.
  const prevParamsRef = useRef<Map<string, string> | null>(null);
  const [flashedParams, setFlashedParams] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (!linkTab) {
      prevParamsRef.current = null;
      return;
    }
    const next = new Map(linkParams);
    const prev = prevParamsRef.current;
    prevParamsRef.current = next;
    if (!prev) {
      return;
    }
    const changed = [...next].filter(([key, value]) => prev.get(key) !== value).map(([key]) => key);
    if (changed.length === 0) {
      return;
    }
    setFlashedParams(new Set(changed));
    const timer = window.setTimeout(() => setFlashedParams(new Set()), 700);
    return () => window.clearTimeout(timer);
  }, [linkTab, linkParams]);

  // One-time attention pulse when the popover opens directly on Get link (⋯ menu).
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
            aria-label={
              linkTab ? t("formLibrary.startLink.title") : t("formLibrary.startPopoverTitle")
            }
            className="tp-form-library-start-popover"
            style={floatingStyles}
            data-row-action
            onClick={(event) => event.stopPropagation()}
          >
            <div className="tp-form-library-start-popover__tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={!linkTab}
                data-active={!linkTab ? "true" : undefined}
                onClick={() => onOpenPopoverChange("start")}
                className={`tp-form-library-start-popover__tab ${focusRing}`}
              >
                {t("formLibrary.startLink.tabStart")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={linkTab}
                data-active={linkTab ? "true" : undefined}
                onClick={() => onOpenPopoverChange("start-link")}
                className={`tp-form-library-start-popover__tab ${focusRing}`}
              >
                {t("formLibrary.startLink.tabLink")}
              </button>
            </div>
            <div className="tp-form-library-start-popover__title">
              {linkTab ? t("formLibrary.startLink.title") : t("formLibrary.startPopoverTitle")}
            </div>
            <div className="tp-form-library-start-popover__subtitle">
              {linkTab
                ? t("formLibrary.startLink.subtitle")
                : t("formLibrary.startPopoverSubtitle")}
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

            {linkTab ? (
              <div
                className="tp-form-library-link-box"
                data-attn={linkAttention ? "true" : undefined}
              >
                <div className="tp-form-library-link-box__label">
                  <svg
                    aria-hidden
                    className="h-3 w-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
                  </svg>
                  {t("formLibrary.startLink.boxLabel")}
                </div>
                <div className="tp-form-library-link-box__url">
                  {linkBase}
                  {linkParams.length > 0 ? "?" : ""}
                  {linkParams.map(([key, value], index) => (
                    <span key={key}>
                      {index > 0 ? <span className="opacity-50">&amp;</span> : null}
                      <span
                        className="tp-form-library-link-box__param"
                        data-flash={flashedParams.has(key) ? "true" : undefined}
                      >
                        {key}={value}
                      </span>
                    </span>
                  ))}
                </div>
                <p className="tp-form-library-link-box__summary">
                  {t("formLibrary.startLink.summaryOpens")} <b>{startSummary}</b> ·{" "}
                  {t("formLibrary.startLink.summaryLateSync")}{" "}
                  <b>
                    {acceptLateSync
                      ? t("formLibrary.startLink.on")
                      : t("formLibrary.startLink.off")}
                  </b>{" "}
                  · {t("formLibrary.startLink.summaryFeedback")}{" "}
                  <b>
                    {liveTeacherFeedbackEnabled
                      ? t("formLibrary.startLink.on")
                      : t("formLibrary.startLink.off")}
                  </b>
                </p>
              </div>
            ) : null}

            {linkTab ? (
              <button
                type="button"
                disabled={!startLinkUrl}
                onClick={() => {
                  const summary = startSummary;
                  void copyToClipboard(startLinkUrl).then((ok) => {
                    if (ok) {
                      toast.success(t("formLibrary.startLink.copiedSummary", { summary }));
                    }
                  });
                  onOpenPopoverChange(null);
                }}
                className={`${ui.btnPrimary} tp-form-library-start-popover__cta disabled:opacity-50`}
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
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                {t("formLibrary.startLink.copyCta", { summary: startSummary })}
              </button>
            ) : (
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
                {starting
                  ? t("common.starting")
                  : t("formLibrary.startCta", { summary: startSummary })}
              </button>
            )}

            {linkTab ? (
              <div className="tp-form-library-start-popover__callout">
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
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v.01M11 12h1v4h1" />
                </svg>
                <span>{t("formLibrary.startLink.callout")}</span>
              </div>
            ) : null}
          </div>
        </FloatingPortal>
      ) : null}
    </EntityListRow>
  );
}
