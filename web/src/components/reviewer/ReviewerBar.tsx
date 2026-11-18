"use client";

import Link from "next/link";
import { useState } from "react";
import { useReviewState, reviewStore, useSaveFailed } from "@/lib/reviewer/store";
import { setReviewer } from "@/lib/reviewer/storage";
import { ExportPanel } from "./ExportPanel";

/** Reviewer name (asked once, kept locally) and the Export / Import panel. Shown on every reviewer page. */
export function ReviewerBar({ lessonOrder }: { lessonOrder: string[] }) {
  const state = useReviewState();
  const saveFailed = useSaveFailed();
  const [open, setOpen] = useState(false);
  const count = Object.values(state.lessons).reduce((n, l) => n + Object.keys(l.items).length + (l.overall ? 1 : 0), 0);

  return (
    <div className="border-b-2 border-line bg-surface">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:px-5">
        <Link href="/reviewer" className="order-1 text-lg font-black text-brand-dark">
          Reviewer mode
        </Link>
        <label className="order-3 flex min-w-0 basis-full items-center gap-2 sm:order-2 sm:basis-auto">
          <span className="text-sm font-extrabold whitespace-nowrap">Your name</span>
          <input
            type="text"
            value={state.reviewer}
            onChange={(e) => reviewStore.update((s) => setReviewer(s, e.target.value))}
            placeholder="Enter once"
            autoComplete="name"
            className={`focus-border min-w-0 flex-1 rounded-xl border-2 bg-surface px-3 py-1 text-base sm:w-56 sm:flex-none focus:border-brand ${
              state.reviewer ? "border-line-strong" : "border-sun-edge"
            }`}
          />
        </label>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="export-panel"
          onClick={() => setOpen((o) => !o)}
          className="order-2 ml-auto min-h-9 rounded-xl sm:order-3 border-2 border-line-strong bg-surface px-3 text-sm font-extrabold hover:bg-sunk"
        >
          Export / Import ({count})
        </button>
        <Link href="/" className="order-4 hidden text-sm font-bold text-muted underline sm:inline">
          Back to the app
        </Link>
      </div>
      {saveFailed && (
        <p role="alert" className="bg-accent-light px-3 py-1.5 text-center text-sm font-extrabold text-accent-dark">
          This browser would not save your reviews (storage is full or blocked). Export now so nothing is lost.
        </p>
      )}
      {open && <ExportPanel lessonOrder={lessonOrder} />}
    </div>
  );
}
