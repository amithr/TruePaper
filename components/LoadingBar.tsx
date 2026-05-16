type LoadingBarProps = {
  /** Visible width; default full width of parent */
  className?: string;
  /** Screen reader / aria label */
  label?: string;
  /** `dark` for zinc-950 backgrounds (e.g. class display) */
  variant?: "default" | "dark";
};

/**
 * Minimal indeterminate progress strip (no percentage).
 */
export function LoadingBar({ className = "", label = "Loading", variant = "default" }: LoadingBarProps) {
  const track = variant === "dark" ? "bg-zinc-800" : "bg-zinc-200";
  const fill = variant === "dark" ? "bg-zinc-300" : "bg-zinc-500";

  return (
    <div
      className={`w-full ${className}`}
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <span className="sr-only">{label}</span>
      <div className={`h-1 overflow-hidden rounded-sm ${track}`}>
        <div className={`tp-loading-bar-segment h-full rounded-sm ${fill}`} />
      </div>
    </div>
  );
}
