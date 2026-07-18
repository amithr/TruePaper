"use client";

import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from "@floating-ui/react";
import { useEffect, useId, useRef } from "react";

import { listBuilderTypeGroups, isAutogradableType } from "@/lib/response-types/builder-groups";
import { responseTypeDescriptionI18nKey } from "@/lib/response-types/registry";
import { responseTypeLabelPath } from "@/lib/response-types/labels";
import type { ResponseTypeId } from "@/lib/response-types/types";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { focusRing } from "@/lib/ui";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  addingType: ResponseTypeId | null;
  onSelect: (type: ResponseTypeId) => void;
};

export function BuilderTypePicker({
  open,
  onOpenChange,
  disabled = false,
  addingType,
  onSelect,
}: Props) {
  const t = useTranslations();
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const groups = listBuilderTypeGroups();

  const { refs, floatingStyles } = useFloating({
    open,
    onOpenChange,
    placement: "top-start",
    middleware: [offset(10), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      onOpenChange(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onOpenChange, open]);

  return (
    <div className="tp-builder-picker" data-tour="add-question">
      <button
        type="button"
        // eslint-disable-next-line react-hooks/refs -- Floating UI callback ref setter
        ref={(node) => {
          buttonRef.current = node;
          refs.setReference(node);
        }}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
        className={`tp-builder-picker__trigger ${focusRing} disabled:opacity-50`}
      >
        <svg
          aria-hidden
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        {t("home.builder.addQuestion")}
      </button>

      {open ? (
        <FloatingPortal>
          <div
            id={panelId}
            ref={(node) => {
              panelRef.current = node;
              refs.setFloating(node);
            }}
            role="dialog"
            aria-label={t("home.builder.addQuestion")}
            className="tp-builder-picker__panel"
            style={{ ...floatingStyles, width: buttonRef.current?.offsetWidth || undefined }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="tp-builder-picker__grid">
              {groups.map((group) => (
                <div key={group.id} className="tp-builder-picker__group">
                  <div className="tp-builder-picker__group-label">
                    {t(`home.builder.picker.groups.${group.labelKey}`)}
                  </div>
                  {group.metas.map((meta) => {
                    const auto = isAutogradableType(meta.id);
                    const busy = addingType === meta.id;
                    return (
                      <button
                        key={meta.id}
                        type="button"
                        disabled={disabled || busy}
                        onClick={() => {
                          onOpenChange(false);
                          onSelect(meta.id);
                        }}
                        className={`tp-builder-picker__type ${focusRing}`}
                      >
                        <span className="tp-builder-picker__type-name">
                          {t(responseTypeLabelPath(meta.id))}
                          {auto ? (
                            <span className="tp-builder-picker__auto">{t("home.builder.picker.auto")}</span>
                          ) : null}
                        </span>
                        <span className="tp-builder-picker__type-desc">
                          {t(responseTypeDescriptionI18nKey(meta))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </FloatingPortal>
      ) : null}
    </div>
  );
}
