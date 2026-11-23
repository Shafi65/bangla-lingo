"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

/** A ring that fills to `value` (0..1) when it appears. */
export function ProgressRing({
  value,
  size = 64,
  stroke = 7,
  tone = "brand",
  delay = 0.25,
  children,
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: "brand" | "sun" | "accent";
  delay?: number;
  children?: ReactNode;
  label: string;
}) {
  const r = (size - stroke) / 2;
  const v = Math.max(0, Math.min(1, value));
  return (
    <span className="relative inline-flex" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-line" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={tone === "brand" ? "stroke-brand" : tone === "sun" ? "stroke-sun" : "stroke-accent"}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: v }}
          transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}
          style={{ opacity: v === 0 ? 0 : 1 }}
        />
      </svg>
      <span aria-hidden className="absolute inset-0 flex items-center justify-center">
        {children}
      </span>
    </span>
  );
}
