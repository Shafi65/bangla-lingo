"use client";

import { useEffect, useRef } from "react";
import { MiniMarkdown } from "./MiniMarkdown";

/**
 * Lesson tip in a native modal <dialog>: the browser traps focus, makes the
 * rest of the page inert, closes on Esc and restores focus to the opener.
 * Mount it to open; `onClose` fires on Esc, backdrop click or the button.
 */
export function TipDialog({ tip, onClose }: { tip: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="tip-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close(); // backdrop
      }}
      className="animate-rise m-auto max-h-[85dvh] w-[min(92vw,34rem)] overflow-y-auto rounded-[var(--radius-panel)] border-2 border-brand/25 bg-brand-light p-6 text-ink backdrop:bg-[var(--color-scrim)] backdrop:backdrop-blur-[2px]"
    >
      <h2 id="tip-title" className="mb-2 text-lg font-black text-brand-dark">
        Tip
      </h2>
      <div className="text-base leading-relaxed font-semibold">
        <MiniMarkdown text={tip} />
      </div>
      <button
        type="button"
        autoFocus
        className="btn btn-primary mt-5 w-full"
        onClick={() => ref.current?.close()}
      >
        Got it
      </button>
    </dialog>
  );
}
