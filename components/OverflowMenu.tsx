"use client";

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
    };

type Props = {
  label: string;
  items: OverflowMenuItem[];
  className?: string;
};

export function OverflowMenu({ label, items, className = "" }: Props) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
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
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        className={`tp-overflow-trigger ${focusRing}`}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
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
        <div
          id={menuId}
          role="menu"
          className="tp-overflow-menu"
          onClick={() => setOpen(false)}
        >
          {items.map((item, index) => {
            if (item.type === "custom") {
              return <div key={item.key}>{item.node}</div>;
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
                onClick={item.onClick}
                className={`tp-overflow-menu__item ${
                  item.tone === "danger" ? "tp-overflow-menu__item--danger" : ""
                } ${focusRing}`}
              >
                {item.label}
              </button>
            );
          })}
          <button
            type="button"
            role="menuitem"
            className={`tp-overflow-menu__item tp-overflow-menu__item--muted ${focusRing}`}
            onClick={() => setOpen(false)}
          >
            {t("common.close")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
