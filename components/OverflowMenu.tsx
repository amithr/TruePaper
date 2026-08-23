"use client";

import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useHover,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type ReactElement,
  type ReactNode,
  type SVGProps,
} from "react";

import { focusRing } from "@/lib/ui";

export type OverflowMenuIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;

export type OverflowMenuItem =
  | {
      type: "button";
      label: string;
      onClick: () => void;
      disabled?: boolean;
      tone?: "default" | "danger";
      /** When true, the menu stays open after click (e.g. arm-then-confirm delete). */
      keepOpen?: boolean;
      icon?: OverflowMenuIcon;
      /** Side tooltip after ~350ms hover/focus — only when explanation is needed. */
      tooltip?: string;
      /** @deprecated Use `tooltip` — still accepted for a short transition. */
      hint?: string;
    }
  | {
      type: "link";
      label: string;
      href: string;
      download?: boolean;
      target?: string;
      rel?: string;
      icon?: OverflowMenuIcon;
      tooltip?: string;
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
  /**
   * @deprecated Close rows are removed from the design system.
   * Kept for API compat; ignored.
   */
  showClose?: boolean;
};

/** Ensures only one overflow menu is open app-wide. */
let activeMenuCloser: (() => void) | null = null;

function claimMenu(close: () => void) {
  if (activeMenuCloser && activeMenuCloser !== close) {
    activeMenuCloser();
  }
  activeMenuCloser = close;
}

function releaseMenu(close: () => void) {
  if (activeMenuCloser === close) {
    activeMenuCloser = null;
  }
}

/* Floating UI's callback-ref setters are stable and safe; the react-hooks/refs
 * heuristic still flags cloneElement/getReferenceProps when a `ref` prop is involved. */
/* eslint-disable react-hooks/refs -- Floating UI callback refs */
function MenuItemTooltip({
  text,
  children,
}: {
  text: string;
  children: ReactElement<Record<string, unknown>>;
}) {
  const tooltipId = useId();
  const [open, setOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "right",
    middleware: [
      offset(10),
      flip({ padding: 8, fallbackPlacements: ["left", "top", "bottom"] }),
      shift({ padding: 8 }),
    ],
    whileElementsMounted: autoUpdate,
  });

  const hover = useHover(context, { delay: { open: 350, close: 0 } });
  // Hover-only: auto-focusing the first menuitem on open would flash tooltips immediately.
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "tooltip" });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, dismiss, role]);

  const child = Children.only(children);
  const childProps = (isValidElement(child) ? child.props : {}) as Record<string, unknown>;
  const childRef = childProps.ref as
    | ((node: HTMLElement | null) => void)
    | { current: HTMLElement | null }
    | null
    | undefined;

  const reference = isValidElement(child) ? (
    cloneElement(child, {
      ...childProps,
      ...getReferenceProps(childProps),
      "aria-describedby": open ? tooltipId : undefined,
      ref: (node: HTMLElement | null) => {
        refs.setReference(node);
        if (typeof childRef === "function") {
          childRef(node);
        } else if (childRef && typeof childRef === "object") {
          childRef.current = node;
        }
      },
    })
  ) : null;

  return (
    <>
      {reference}
      {open ? (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            id={tooltipId}
            role="tooltip"
            className="tp-overflow-menu__tooltip"
            style={floatingStyles}
            {...getFloatingProps()}
          >
            {text}
          </div>
        </FloatingPortal>
      ) : null}
    </>
  );
}
/* eslint-enable react-hooks/refs */

function ItemIcon({ Icon }: { Icon: OverflowMenuIcon }) {
  return <Icon aria-hidden className="tp-overflow-menu__icon" width={16} height={16} />;
}

export function OverflowMenu({
  label,
  items,
  className = "",
  open: openProp,
  onOpenChange,
}: Props) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : uncontrolledOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (!controlled) {
        setUncontrolledOpen(next);
      }
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  const close = useCallback(() => setOpen(false), [setOpen]);

  const { refs, floatingStyles } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-end",
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const setTriggerRef = useCallback(
    (node: HTMLButtonElement | null) => {
      triggerRef.current = node;
      refs.setReference(node);
    },
    [refs],
  );

  useEffect(() => {
    if (!open) {
      releaseMenu(close);
      return;
    }
    claimMenu(close);
    return () => releaseMenu(close);
  }, [open, close]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      // Tooltips render in a portal — ignore clicks on them.
      if ((target as Element).closest?.(".tp-overflow-menu__tooltip")) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      const focusable = itemRefs.current.filter(Boolean) as HTMLElement[];
      if (focusable.length === 0) {
        return;
      }
      const currentIndex = focusable.findIndex((el) => el === document.activeElement);
      if (event.key === "ArrowDown") {
        event.preventDefault();
        const next = currentIndex < 0 ? 0 : (currentIndex + 1) % focusable.length;
        focusable[next]?.focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        const next =
          currentIndex < 0
            ? focusable.length - 1
            : (currentIndex - 1 + focusable.length) % focusable.length;
        focusable[next]?.focus();
      } else if (event.key === "Home") {
        event.preventDefault();
        focusable[0]?.focus();
      } else if (event.key === "End") {
        event.preventDefault();
        focusable[focusable.length - 1]?.focus();
      }
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    // Focus first item after open.
    requestAnimationFrame(() => {
      const first = itemRefs.current.find(Boolean);
      first?.focus();
    });
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, setOpen]);

  const showIcons = items.some(
    (item) => (item.type === "button" || item.type === "link") && item.icon,
  );

  if (items.length === 0) {
    return null;
  }

  let focusableIndex = 0;

  const renderActionContent = (
    item: Extract<OverflowMenuItem, { type: "button" | "link" }>,
  ) => (
    <>
      {showIcons ? (
        item.icon ? (
          <ItemIcon Icon={item.icon} />
        ) : (
          <span className="tp-overflow-menu__icon-spacer" aria-hidden />
        )
      ) : null}
      <span className="tp-overflow-menu__label">{item.label}</span>
    </>
  );

  return (
    <div ref={rootRef} className={className} onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        ref={setTriggerRef}
        className={`tp-overflow-trigger ${focusRing}`}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="sr-only">{label}</span>
        <svg aria-hidden className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
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
                return (
                  <div key={item.key} className="tp-overflow-menu__divider" role="separator" />
                );
              }
              if (item.type === "custom") {
                return (
                  <div
                    key={item.key}
                    className="tp-overflow-menu__custom"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {item.node}
                  </div>
                );
              }

              const tooltipText =
                item.type === "button"
                  ? item.tooltip ?? item.hint
                  : item.tooltip;
              const itemIndex = focusableIndex++;
              const toneDanger =
                item.type === "button" && item.tone === "danger"
                  ? "tp-overflow-menu__item--danger"
                  : "";

              const assignRef = (node: HTMLElement | null) => {
                itemRefs.current[itemIndex] = node;
              };

              if (item.type === "link") {
                const link = (
                  <a
                    role="menuitem"
                    href={item.href}
                    download={item.download}
                    target={item.target}
                    rel={item.rel}
                    className={`tp-overflow-menu__item ${toneDanger} ${focusRing}`}
                    onClick={() => setOpen(false)}
                    ref={assignRef}
                  >
                    {renderActionContent(item)}
                  </a>
                );
                if (!tooltipText) {
                  return <span key={`${item.label}-${index}`}>{link}</span>;
                }
                return (
                  <MenuItemTooltip key={`${item.label}-${index}`} text={tooltipText}>
                    {link}
                  </MenuItemTooltip>
                );
              }

              const buttonClass = `tp-overflow-menu__item ${toneDanger} ${focusRing}`;
              const button = (
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  className={buttonClass}
                  ref={assignRef}
                  onClick={() => {
                    item.onClick();
                    if (!item.keepOpen) {
                      setOpen(false);
                    }
                  }}
                >
                  {renderActionContent(item)}
                </button>
              );
              if (!tooltipText) {
                return <span key={`${item.label}-${index}`}>{button}</span>;
              }

              return (
                <MenuItemTooltip key={`${item.label}-${index}`} text={tooltipText}>
                  {button}
                </MenuItemTooltip>
              );
            })}
          </div>
        </FloatingPortal>
      ) : null}
    </div>
  );
}
