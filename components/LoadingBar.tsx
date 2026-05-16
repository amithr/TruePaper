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
  const track = variant === "dark" ? "bg-zinc-700" : "tp-loading-track";
  const fill = variant === "dark" ? "bg-zinc-300 tp-loading-bar-segment" : "tp-loading-fill tp-loading-bar-segment";

  return (
    <div className={`w-full ${className}`} role="status" aria-busy="true" aria-label={label}>
      <span className="sr-only">{label}</span>
      <div className={track}>
        <div className={`h-full ${fill}`} />
      </div>
    </div>
  );
}
