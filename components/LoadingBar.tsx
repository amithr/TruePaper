type LoadingBarProps = {
  /** Visible width; default full width of parent */
  className?: string;
  /** Screen reader / aria label */
  label?: string;
  /** `dark` for dark backgrounds (e.g. class display) */
  variant?: "default" | "dark";
};

/**
 * Minimal indeterminate progress strip (no percentage).
 */
export function LoadingBar({ className = "", label = "Loading", variant = "default" }: LoadingBarProps) {
  const trackClass = variant === "dark" ? "tp-loading-track bg-zinc-700" : "tp-loading-track";
  const segmentClass =
    variant === "dark"
      ? "tp-loading-bar-segment tp-loading-bar-segment--dark"
      : "tp-loading-bar-segment tp-loading-bar-segment--brand";

  return (
    <div className={`w-full ${className}`} role="status" aria-busy="true" aria-label={label}>
      <span className="sr-only">{label}</span>
      <div className={trackClass} aria-hidden>
        <div className={segmentClass} />
      </div>
    </div>
  );
}
