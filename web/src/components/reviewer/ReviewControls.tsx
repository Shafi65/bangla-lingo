"use client";

import { useState } from "react";
import { currentVerdict, itemStatus, VERDICT_LABEL, type Verdict } from "@/lib/reviewer/storage";
import { setItemField, setVerdict, useReviewState } from "@/lib/reviewer/store";
import type { Target } from "@/lib/reviewer/targets";
import { Chip } from "./bits";

const TONE: Record<Verdict, string> = {
  ok: "border-brand bg-brand text-white",
  needs_change: "border-accent bg-accent text-white",
  unsure: "border-sun-edge bg-sun text-ink",
};
const KEY_HINT: Record<Verdict, string> = { ok: "1", needs_change: "2", unsure: "3" };

const FIELD =
  "focus-border block w-full resize-y rounded-xl border-2 border-line-strong bg-surface px-3 py-1.5 text-base leading-relaxed text-ink placeholder:text-muted/80 focus:border-brand";

/** OK / Needs change / Unsure, a comment box and, for "Needs change", a suggested correction. */
export function ReviewControls({
  lessonId,
  target,
  compact = false,
}: {
  lessonId: string;
  target: Target;
  /** Vocab rows: small buttons, fields only on request. */
  compact?: boolean;
}) {
  const state = useReviewState();
  const entry = state.lessons[lessonId]?.items[target.key];
  const status = itemStatus(entry, target.hash);
  const verdict = currentVerdict(entry, target.hash);
  const [open, setOpen] = useState(false);
  const showCorrection = verdict === "needs_change" || !!entry?.correction;
  const showFields = !compact || open || showCorrection || !!entry?.comment;
  const label = target.kind === "tip" ? "the tip" : target.kind === "vocab" ? target.key.slice(6) : `exercise ${target.key}`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Verdict for ${label}`}>
        {(["ok", "needs_change", "unsure"] as const).map((v) => {
          const on = verdict === v;
          return (
            <button
              key={v}
              type="button"
              aria-pressed={on}
              aria-label={VERDICT_LABEL[v]}
              aria-keyshortcuts={KEY_HINT[v]}
              onClick={() => setVerdict(lessonId, target, on ? undefined : v)}
              className={`inline-flex items-center gap-1.5 rounded-xl border-2 font-extrabold transition-colors ${
                compact ? "min-h-8 px-2 text-sm" : "min-h-9 px-3 text-sm"
              } ${on ? TONE[v] : "border-line-strong bg-surface text-ink hover:bg-sunk"}`}
            >
              {VERDICT_LABEL[v]}
              {!compact && (
                <kbd className={`hidden rounded border px-1 text-[0.65rem] leading-4 sm:inline ${on ? "border-white/50" : "border-line-strong text-muted"}`}>
                  {KEY_HINT[v]}
                </kbd>
              )}
            </button>
          );
        })}
        {compact && (
          <button
            type="button"
            aria-expanded={showFields}
            onClick={() => setOpen((o) => !o)}
            className="min-h-8 rounded-xl border-2 border-transparent px-2 text-sm font-extrabold text-brand-dark underline"
          >
            {entry?.comment || entry?.correction ? "Note" : "+ Note"}
          </button>
        )}
        {status === "changed" && (
          <Chip tone="warn">
            Changed since your review{entry?.verdict ? ` (was: ${VERDICT_LABEL[entry.verdict]})` : ""}
          </Chip>
        )}
      </div>
      {showFields && (
        <div className="grid gap-2">
          {showCorrection && (
            <label className="block">
              <span className="mb-0.5 block text-xs font-extrabold tracking-wide text-accent-dark uppercase">Suggested correction</span>
              <input
                type="text"
                value={entry?.correction ?? ""}
                onChange={(e) => setItemField(lessonId, target, "correction", e.target.value)}
                aria-label={`Suggested correction for ${label}`}
                placeholder="What it should say (বাংলা is fine)"
                className={FIELD}
              />
            </label>
          )}
          <textarea
            rows={compact ? 1 : 2}
            value={entry?.comment ?? ""}
            onChange={(e) => setItemField(lessonId, target, "comment", e.target.value)}
            aria-label={`Comment on ${label}`}
            placeholder="Comment (বাংলা is fine)"
            className={`${FIELD} field-sizing-content min-h-9`}
          />
        </div>
      )}
    </div>
  );
}
