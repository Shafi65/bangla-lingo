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
      className="m-auto w-[min(92vw,34rem)] max-h-[85dvh] overflow-y-auto rounded-3xl border-2 border-brand/20 bg-brand-light p-5 text-ink backdrop:bg-black/40"
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
