"use client";

import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from "@floating-ui/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import { focusRing } from "@/lib/ui";

export type OverflowMenuItem =
  | {
      type: "button";
      label: string;
      onClick: () => void;
      disabled?: boolean;
      tone?: "default" | "danger";
      /** When true, the menu stays open after click (e.g. arm-then-confirm delete). */
      keepOpen?: boolean;
    }
  | {
      type: "link";
      label: string;
      href: string;
      download?: boolean;
      target?: string;
      rel?: string;
    }
  | {
      type: "custom";
      key: string;
      node: ReactNode;
    }
  | {
      type: "divider";
      key: string;
    };

type Props = {
  label: string;
  items: OverflowMenuItem[];
  className?: string;
  /** Controlled open state. When set, pair with `onOpenChange`. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** When false, omit the trailing Close row (click-outside still dismisses). Default true. */
  showClose?: boolean;
};

export function OverflowMenu({
  label,
  items,
  className = "",
  open: openProp,
  onOpenChange,
  showClose = true,
}: Props) {
  const t = useTranslations();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (!controlled) {
      setUncontrolledOpen(next);
    }
    onOpenChange?.(next);
  };
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const { refs, floatingStyles } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-end",
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div ref={rootRef} className={className} onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        // eslint-disable-next-line react-hooks/refs -- Floating UI callback ref setter
        ref={refs.setReference}
        className={`tp-overflow-trigger ${focusRing}`}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(!open);
        }}
      >
        <span className="sr-only">{label}</span>
        <svg
          aria-hidden
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <circle cx="12" cy="5" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="12" cy="19" r="1.75" />
        </svg>
      </button>
      {open ? (
        <FloatingPortal>
          <div
            id={menuId}
            ref={(node) => {
              menuRef.current = node;
              refs.setFloating(node);
            }}
            role="menu"
            className="tp-overflow-menu tp-overflow-menu--portal"
            style={floatingStyles}
            onClick={(event) => event.stopPropagation()}
          >
            {items.map((item, index) => {
              if (item.type === "divider") {
                return <div key={item.key} className="tp-overflow-menu__divider" role="separator" />;
              }
              if (item.type === "custom") {
                return (
                  <div
                    key={item.key}
                    className="px-3 py-2"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {item.node}
                  </div>
                );
              }
              if (item.type === "link") {
                return (
                  <a
                    key={`${item.label}-${index}`}
                    role="menuitem"
                    href={item.href}
                    download={item.download}
                    target={item.target}
                    rel={item.rel}
                    className={`tp-overflow-menu__item ${focusRing}`}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </a>
                );
              }
              return (
                <button
                  key={`${item.label}-${index}`}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    item.onClick();
                    if (!item.keepOpen) {
                      setOpen(false);
                    }
                  }}
                  className={`tp-overflow-menu__item ${
                    item.tone === "danger" ? "tp-overflow-menu__item--danger" : ""
                  } ${focusRing}`}
                >
                  {item.label}
                </button>
              );
            })}
            {showClose ? (
              <button
                type="button"
                role="menuitem"
                className={`tp-overflow-menu__item tp-overflow-menu__item--muted ${focusRing}`}
                onClick={() => setOpen(false)}
              >
                {t("common.close")}
              </button>
            ) : null}
          </div>
        </FloatingPortal>
      ) : null}
    </div>
  );
}
