"use client";

import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  safePolygon,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
  type Placement,
} from "@floating-ui/react";
import { useState, type ReactNode } from "react";

import { useHelpPrefs } from "@/lib/use-help-prefs";
import { focusRing } from "@/lib/ui";

type Props = {
  /** Stable, unique id (used for the tooltip element id / aria-describedby). */
  id: string;
  /** The hint copy (already translated). */
  text: string;
  /** Accessible label for the trigger button; defaults to the hint text. */
  label?: string;
  placement?: Placement;
  className?: string;
  /** Optional control to sit beside the ⓘ trigger. */
  children?: ReactNode;
};

/**
 * Subtle, optional onboarding tooltip for teacher surfaces. Opens on hover, keyboard
 * focus, or tap; closes on ESC / outside interaction. Renders nothing (no trigger)
 * when the teacher has turned hints off — wrapped children still render.
 */
export function HelpHint({ id, text, label, placement = "top", className = "", children }: Props) {
  const { ready, hintsEnabled } = useHelpPrefs();
  const [open, setOpen] = useState(false);
  const tooltipId = `help-hint-${id}`;

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const hover = useHover(context, {
    move: false,
    handleClose: safePolygon(),
    delay: { open: 120, close: 40 },
  });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "tooltip" });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);

  if (!ready || !hintsEnabled) {
    return children ? <>{children}</> : null;
  }

  return (
    <span className={`tp-help-hint ${className}`.trim()}>
      {children}
      <button
        type="button"
        ref={refs.setReference}
        className={`tp-help-hint__trigger ${focusRing}`}
        aria-label={label ?? text}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        {...getReferenceProps({ onClick: () => setOpen((value) => !value) })}
      >
        <svg aria-hidden viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
          <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M12 11v5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="12" cy="7.75" r="1.1" fill="currentColor" />
        </svg>
      </button>
      {open ? (
        <FloatingPortal>
          <div
            // Floating UI exposes a stable callback-ref setter (not a `.current`
            // read), so this is safe despite the react-hooks/refs heuristic.
            // eslint-disable-next-line react-hooks/refs
            ref={refs.setFloating}
            id={tooltipId}
            role="tooltip"
            className="tp-help-hint__bubble"
            style={floatingStyles}
            {...getFloatingProps()}
          >
            {text}
          </div>
        </FloatingPortal>
      ) : null}
    </span>
  );
}
