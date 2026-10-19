"use client";

import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingPortal,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
} from "@floating-ui/react";
import { ChevronDown, FilePlus2, Plus, Sparkles, type LucideIcon } from "lucide-react";
import { useRef, useState } from "react";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import { focusRing, ui } from "@/lib/ui";

type Props = {
  creating: boolean;
  disabled?: boolean;
  onCreateBlank: () => void;
  onCreateWithAi: () => void;
};

type Option = {
  key: "blank" | "ai";
  icon: LucideIcon;
  title: string;
  description: string;
  onSelect: () => void;
};

/**
 * "New form" primary action: choose between a blank form and an AI-generated one
 * (which opens the AI guide → import flow). Rich two-line rows, so it uses its own
 * menu instead of the compact ⋯ OverflowMenu.
 */
/* Floating UI's callback-ref setters are stable and safe; the react-hooks/refs
 * heuristic still flags them when spread through getReferenceProps / getFloatingProps. */
/* eslint-disable react-hooks/refs -- Floating UI callback refs */
export function NewFormMenu({ creating, disabled = false, onCreateBlank, onCreateWithAi }: Props) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const listRef = useRef<Array<HTMLElement | null>>([]);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-end",
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "menu" });
  const listNavigation = useListNavigation(context, {
    listRef,
    activeIndex,
    onNavigate: setActiveIndex,
    loop: true,
  });
  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    click,
    dismiss,
    role,
    listNavigation,
  ]);

  const options: Option[] = [
    {
      key: "blank",
      icon: FilePlus2,
      title: t("formLibrary.newFormMenu.blankTitle"),
      description: t("formLibrary.newFormMenu.blankDescription"),
      onSelect: onCreateBlank,
    },
    {
      key: "ai",
      icon: Sparkles,
      title: t("formLibrary.newFormMenu.aiTitle"),
      description: t("formLibrary.newFormMenu.aiDescription"),
      onSelect: onCreateWithAi,
    },
  ];

  return (
    <>
      <button
        ref={refs.setReference}
        type="button"
        data-tour="new-form"
        disabled={disabled || creating}
        aria-busy={creating}
        className={`${ui.btnPrimary} inline-flex items-center gap-2 disabled:opacity-50`}
        {...getReferenceProps()}
      >
        {creating ? (
          <span
            className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80"
            aria-hidden
          />
        ) : (
          <Plus aria-hidden className="h-4 w-4" strokeWidth={2.4} />
        )}
        {creating ? t("common.creating") : t("formLibrary.newForm")}
        {creating ? null : (
          <ChevronDown
            aria-hidden
            className={`h-4 w-4 opacity-80 transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>

      {open ? (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false}>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              className="tp-new-form-menu"
              aria-label={t("formLibrary.newFormMenu.label")}
              {...getFloatingProps()}
            >
              {options.map((option, index) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.key}
                    type="button"
                    role="menuitem"
                    tabIndex={activeIndex === index ? 0 : -1}
                    ref={(node) => {
                      listRef.current[index] = node;
                    }}
                    data-testid={`new-form-${option.key}`}
                    className={`tp-new-form-menu__item ${focusRing}`}
                    {...getItemProps({
                      onClick: () => {
                        setOpen(false);
                        option.onSelect();
                      },
                    })}
                  >
                    <span className="tp-new-form-menu__icon" data-kind={option.key} aria-hidden>
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0">
                      <span className="tp-new-form-menu__title">{option.title}</span>
                      <span className="tp-new-form-menu__description">{option.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      ) : null}
    </>
  );
}
/* eslint-enable react-hooks/refs */
