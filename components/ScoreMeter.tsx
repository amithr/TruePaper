"use client";

import { useId } from "react";

import { scorePercent, scoreTier, type ScoreTier } from "@/lib/exam-grades";
import { useCountUp } from "@/lib/use-count-up";

type CommonProps = {
  earned: number;
  possible: number;
  /** When true, the value count-ups from the previous render. Default: true. */
  animate?: boolean;
  className?: string;
  label?: string;
};

type RingProps = CommonProps & {
  /** Ring outer diameter in px. Default 96. */
  size?: number;
  /** Stroke thickness in px. Default 10. */
  stroke?: number;
  /** Show "X / Y" under the percentage. Default true. */
  showPoints?: boolean;
};

type BarProps = CommonProps & {
  height?: number;
};

export function tierAccentColor(tier: ScoreTier): string {
  switch (tier) {
    case "perfect":
      return "var(--tp-mint)";
    case "great":
      return "var(--tp-mint)";
    case "solid":
      return "var(--tp-amber)";
    default:
      return "var(--tp-coral)";
  }
}

/**
 * Circular score ring with animated count-up.
 * Used in /review/[token] header and the teacher watch sticky strip.
 */
export function ScoreRing({
  earned,
  possible,
  animate = true,
  size = 96,
  stroke = 10,
  showPoints = true,
  className,
  label,
}: RingProps) {
  const id = useId();
  const gradId = `score-ring-${id}`;
  const pct = scorePercent(earned, possible);
  const animatedPct = useCountUp(animate ? pct : pct, animate ? 800 : 0);
  const animatedEarned = useCountUp(animate ? earned : earned, animate ? 800 : 0);
  const tier = scoreTier(earned, possible);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (animatedPct / 100) * circumference;
  const stopFrom = tierAccentColor(tier);
  const stopTo =
    tier === "perfect"
      ? "#34d399"
      : tier === "great"
        ? "#10b981"
        : tier === "solid"
          ? "#fbbf24"
          : "#fb7185";

  return (
    <div
      className={`tp-score-ring tp-score-ring--${tier} ${className ?? ""}`}
      role="img"
      aria-label={
        label ?? `Score: ${earned} out of ${possible} (${pct} percent)`
      }
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={stopFrom} />
            <stop offset="100%" stopColor={stopTo} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--tp-bg-subtle)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 200ms var(--tp-ease-soft)" }}
        />
      </svg>
      <div className="tp-score-ring__inner" aria-hidden>
        <span className="tp-score-ring__pct">{animatedPct}%</span>
        {showPoints ? (
          <span className="tp-score-ring__pts">
            {animatedEarned} / {possible}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Horizontal score bar — used in tables / compact rows.
 */
export function ScoreBar({ earned, possible, animate = true, className, height = 6 }: BarProps) {
  const pct = scorePercent(earned, possible);
  const animatedPct = useCountUp(animate ? pct : pct, animate ? 700 : 0);
  const tier = scoreTier(earned, possible);
  return (
    <div className={`tp-score-bar tp-score-bar--${tier} ${className ?? ""}`}>
      <div className="tp-score-bar__track" style={{ height }}>
        <div className="tp-score-bar__fill" style={{ width: `${animatedPct}%`, height }} />
      </div>
      <div className="tp-score-bar__label">
        <span className="tp-score-bar__pts">
          {earned} / {possible}
        </span>
        <span className="tp-score-bar__pct">{pct}%</span>
      </div>
    </div>
  );
}
