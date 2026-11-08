"use client";

import { useState } from "react";
import { useTranslitVisibility } from "./CourseContext";

/**
 * Romanized pronunciation, shown according to the learner's transliteration
 * setting. In "reveal" mode it sits behind a small tap target.
 */
export function Translit({
  tr,
  className = "",
  inButton = false,
}: {
  tr: string;
  className?: string;
  /** Inside another button: no nested tap target, so hide entirely in "reveal" mode. */
  inButton?: boolean;
}) {
  const vis = useTranslitVisibility();
  const [open, setOpen] = useState(false);

  if (vis === "reveal" && inButton) return null;

  if (vis === "reveal" && !open) {
    return (
      <button
        type="button"
        data-enter-native
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={`translit-reveal ${className}`}
      >
        Show pronunciation
      </button>
    );
  }
  return (
    <span
      className={`italic ${vis === "faded" ? "text-muted/70" : "text-muted"} ${className}`}
    >
      {tr}
    </span>
  );
}
