"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

/** A number that counts up from `from` to `to` (shows the final value at once with reduced motion). */
export function CountUp({ to, from = 0, duration = 0.9, delay = 0.2, className }: { to: number; from?: number; duration?: number; delay?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce || to === from) {
      el.textContent = String(to);
      return;
    }
    el.textContent = String(from);
    const c = animate(from, to, {
      duration,
      delay,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        el.textContent = String(Math.round(v));
      },
    });
    return () => c.stop();
  }, [to, from, duration, delay, reduce]);
  // The final value is the accessible text; the animation only changes what is painted.
  return (
    <span className={`tabular-nums ${className ?? ""}`}>
      <span className="sr-only">{to}</span>
      <span ref={ref} aria-hidden>
        {to}
      </span>
    </span>
  );
}
