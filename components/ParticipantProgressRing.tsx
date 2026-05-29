"use client";

type Props = {
  value: number;
  max: number;
  tone: "complete" | "strong" | "mid" | "score-perfect" | "score-great" | "score-solid" | "score-needs";
  size?: number;
  className?: string;
  label?: string;
};

export function ParticipantProgressRing({
  value,
  max,
  tone,
  size = 22,
  className,
  label,
}: Props) {
  const safeMax = Math.max(1, max);
  const pct = Math.min(100, Math.max(0, (value / safeMax) * 100));
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (pct / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`tp-progress-ring tp-progress-ring--${tone} ${className ?? ""}`}
      role="img"
      aria-label={label}
    >
      <circle
        className="tp-progress-ring__track"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
      />
      <circle
        className="tp-progress-ring__fill"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
