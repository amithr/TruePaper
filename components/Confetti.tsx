"use client";

import { useEffect, useState } from "react";

import { deferEffect } from "@/lib/defer-effect";

const COLORS = ["#7c3aed", "#10b981", "#f59e0b", "#2563eb", "#f97162", "#22d3ee"];

type Piece = {
  id: number;
  left: number;
  dx: string;
  rot: string;
  delay: string;
  dur: string;
  color: string;
};

type Props = {
  /** Number of confetti pieces. Default 28. */
  pieces?: number;
  /** Auto-remove after this many ms. Default 2000. */
  durationMs?: number;
  /** When true, the burst is mounted. Pass false to skip. */
  active?: boolean;
};

function generatePieces(count: number): Piece[] {
  return Array.from({ length: count }, (_, i) => {
    const left = Math.round((i / count) * 100 + (Math.random() - 0.5) * (100 / count));
    const dx = `${Math.round((Math.random() - 0.5) * 220)}px`;
    const rot = `${Math.round((Math.random() - 0.5) * 720)}deg`;
    const delay = `${Math.round(Math.random() * 200)}ms`;
    const dur = `${Math.round(900 + Math.random() * 900)}ms`;
    const color = COLORS[i % COLORS.length];
    return { id: i, left, dx, rot, delay, dur, color };
  });
}

/**
 * Lightweight, dependency-free confetti burst. CSS-driven (no JS animation loop).
 * Honors `prefers-reduced-motion` by not rendering. Confetti positions are
 * randomized once per mount (in an effect) so render stays pure.
 */
export function Confetti({ pieces = 28, durationMs = 2000, active = true }: Props) {
  const [items, setItems] = useState<Piece[] | null>(null);

  useEffect(() => {
    if (!active) {
      return;
    }
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }
    }
    deferEffect(() => setItems(generatePieces(pieces)));
    const id = window.setTimeout(() => {
      deferEffect(() => setItems(null));
    }, durationMs);
    return () => window.clearTimeout(id);
  }, [active, durationMs, pieces]);

  if (!items) {
    return null;
  }

  return (
    <div className="tp-confetti" aria-hidden>
      {items.map((p) => (
        <span
          key={p.id}
          className="tp-confetti__piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            ["--dx" as string]: p.dx,
            ["--rot" as string]: p.rot,
            ["--delay" as string]: p.delay,
            ["--dur" as string]: p.dur,
            animationDelay: p.delay,
          }}
        />
      ))}
    </div>
  );
}
