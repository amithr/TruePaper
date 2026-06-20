"use client";

import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
  type Placement,
} from "@floating-ui/react";
import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

type Props = {
  text: string;
  placement?: Placement;
  className?: string;
  children: ReactNode;
};

/**
 * Tooltip on hover, focus, or tap. Unlike HelpHint, always available and wraps the
 * trigger element rather than adding a separate ⓘ button.
 */
export function HoverTooltip({ text, placement = "top", className = "", children }: Props) {
  const tooltipId = useId();
  const [open, setOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const hover = useHover(context, {
    delay: { open: 280, close: 0 },
  });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "tooltip" });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);

  const child = Children.only(children);
  const reference = isValidElement(child) ? (
    cloneElement(
      child as ReactElement<Record<string, unknown>>,
      getReferenceProps({
        ref: refs.setReference,
        ...(child.props as Record<string, unknown>),
        className: [className, (child.props as { className?: string }).className]
          .filter(Boolean)
          .join(" "),
        "aria-describedby": open ? tooltipId : undefined,
      }),
    )
  ) : (
    <span
      className={`tp-tooltip-anchor ${className}`.trim()}
      ref={refs.setReference}
      {...getReferenceProps({
        "aria-describedby": open ? tooltipId : undefined,
      })}
    >
      {children}
    </span>
  );

  return (
    <>
      {reference}
      {open ? (
        <FloatingPortal>
          <div
            // eslint-disable-next-line react-hooks/refs
            ref={refs.setFloating}
            id={tooltipId}
            role="tooltip"
            className="tp-tooltip"
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
