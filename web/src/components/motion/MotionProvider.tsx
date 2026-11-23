"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/** App-wide motion settings: follow the device's "reduce motion" preference. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
