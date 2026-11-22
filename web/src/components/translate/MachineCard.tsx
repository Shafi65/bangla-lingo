"use client";

import { useEffect, useState } from "react";
import { SpeakButton } from "../SpeakButton";
import { Translit } from "../Translit";
import { useTranslitVisibility } from "../CourseContext";
import type { MachineState } from "@/lib/translate/client";
import type { ComposedRoman } from "@/lib/translate/romanize";
import { availabilityLine, type Availability } from "./CourseResults";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      data-enter-native
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch {
          // Clipboard blocked: nothing to do; the text can still be selected by hand.
        }
      }}
      className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-line-strong bg-surface px-3 text-sm font-extrabold text-ink hover:bg-sunk"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {copied ? (
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        ) : (
          <>
            <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
            <path d="M15.5 8.5V6a1.5 1.5 0 00-1.5-1.5H6A1.5 1.5 0 004.5 6v8A1.5 1.5 0 006 15.5h2.5" />
          </>
        )}
      </svg>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/** Romanization under Bengali output. From the course it is shown like any course romanization; with
 *  words from the translator it is labelled approximate. Follows the learner's romanization setting. */
function Roman({ roman }: { roman: ComposedRoman }) {
  const vis = useTranslitVisibility();
  const [open, setOpen] = useState(false);
  if (!roman.approx) {
    return (
      <p className="mt-1 text-base">
        <Translit tr={roman.text} />
      </p>
    );
  }
  if (vis === "reveal" && !open) {
    return (
      <p className="mt-1">
        <button type="button" data-enter-native onClick={() => setOpen(true)} className="translit-reveal">
          Show approximate romanization
        </button>
      </p>
    );
  }
  return (
    <p className="mt-1 text-base">
      <span className={`italic ${vis === "faded" ? "text-muted/70" : "text-muted"}`}>{roman.text}</span>
      <span className="ml-2 rounded-full bg-sunk px-2 py-0.5 align-middle text-xs font-extrabold text-muted">
        approximate romanization
      </span>
    </p>
  );
}

/** The machine-translation card. Kept visually apart from the course results it supplements. */
export function MachineCard({
  state,
  romanized,
  stale,
  availability = "unknown",
  onEnglish,
  quiet = false,
}: {
  state: MachineState;
  /** Romanization of a Bengali result: course words, with the translator's for the rest. */
  romanized: ComposedRoman | null;
  /** The box, direction or mode has changed since this result. */
  stale: boolean;
  availability?: Availability;
  /** "It's English": offered under "Read as" when a romanized reading looks wrong. */
  onEnglish?: () => void;
  /** The course empty state above already says what to do next; don't repeat it. */
  quiet?: boolean;
}) {
  if (state.s === "idle") {
    if (quiet) return null;
    if (availability === "off" || availability === "offline") {
      return <p className="mt-6 text-sm font-semibold text-muted">{availabilityLine(availability)}</p>;
    }
    return (
      <p className="mt-6 text-sm font-semibold text-muted">
        For a whole sentence the course doesn&apos;t cover, press <kbd className="rounded-md border border-line-strong bg-surface px-1.5 font-sans text-xs font-extrabold">Enter</kbd> or Translate.
      </p>
    );
  }

  return (
    <section
      aria-labelledby="machine-heading"
      aria-busy={state.s === "loading"}
      className="mt-6 rounded-[var(--radius-card)] border-2 border-dashed border-line-strong bg-sunk/60 p-4"
    >
      <h2 id="machine-heading" className="text-base font-black">
        Machine translation
      </h2>
      <p className="text-sm font-semibold text-muted">
        May not be natural Bangladeshi Bengali; check with the course words above.
      </p>

      <div role="status" aria-live="polite" className="sr-only">
        {state.s === "loading" ? "Translating…" : state.s === "done" ? `Translation: ${state.text}` : ""}
      </div>

      {state.s === "loading" && (
        <div className="mt-3 space-y-2" aria-hidden>
          <p className="flex items-center gap-2 text-base font-bold text-muted">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-brand motion-reduce:animate-none" />
            Translating…
          </p>
          <div className="h-7 w-3/4 animate-pulse rounded-lg bg-line motion-reduce:animate-none" />
          <div className="h-4 w-1/2 animate-pulse rounded-lg bg-line motion-reduce:animate-none" />
        </div>
      )}

      {state.s === "unconfigured" && (
        <p className="mt-3 rounded-xl bg-surface px-3 py-2 font-bold text-ink">
          Machine translation isn&apos;t set up yet. Course words still work.
        </p>
      )}

      {state.s === "offline" && (
        <p className="mt-3 rounded-xl bg-surface px-3 py-2 font-bold text-ink">
          You&apos;re offline. Machine translation needs a connection; course words still work.
        </p>
      )}

      {state.s === "error" && (
        <p className="mt-3 rounded-xl bg-surface px-3 py-2 font-bold text-ink" role="alert">{state.message}</p>
      )}

      {state.s === "done" && (
        <div className={`mt-3 ${stale ? "opacity-60" : ""}`}>
          {state.read && (
            <div className="mb-3 rounded-xl bg-surface px-3 py-2">
              <p className="text-base font-bold text-ink">
                <span className="text-sm font-extrabold text-muted">Read as: </span>
                <span lang="bn" className="bn-display text-xl font-semibold">
                  {state.read}
                </span>
              </p>
              {onEnglish && (
                <p className="text-sm font-semibold text-muted">
                  Not what you meant?{" "}
                  <button
                    type="button"
                    data-enter-native
                    onClick={onEnglish}
                    className="inline-flex min-h-11 items-center font-extrabold text-brand-dark underline decoration-2 underline-offset-2"
                  >
                    It&apos;s English
                  </button>
                </p>
              )}
            </div>
          )}
          <p
            lang={state.to === "bn" ? "bn" : "en"}
            className={`break-words text-ink ${state.to === "bn" ? "bn-display text-3xl font-semibold" : "text-2xl font-extrabold"}`}
          >
            {state.text}
          </p>
          {state.to === "bn" && romanized && <Roman roman={romanized} />}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {state.to === "bn" && <SpeakButton bn={state.text} size="sm" />}
            <CopyButton text={state.text} />
            {stale && <span className="text-sm font-semibold text-muted">For your earlier text. Press Enter to update.</span>}
            {state.cached && !stale && <span className="text-sm font-semibold text-muted">Saved on this device</span>}
          </div>
        </div>
      )}
    </section>
  );
}
