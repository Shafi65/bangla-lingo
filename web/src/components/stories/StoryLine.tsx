"use client";

import { useEffect, useId, useRef, useState } from "react";
import { SpeakButton } from "@/components/SpeakButton";
import { Translit } from "@/components/Translit";
import type { StoryLine as StoryLineT, StoryWord } from "@/lib/stories/types";

/**
 * One story line: play button, Bengali with every word tappable, romanization (per the learner's
 * setting) and a hidden-until-asked English translation. Tapping a word opens its gloss card under
 * the line (Escape or Close returns focus to the word).
 */
export function StoryLine({ line, index, active }: { line: StoryLineT; index: number; active: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const [showEn, setShowEn] = useState(false);
  const wordRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const base = useId();
  const enId = `${base}-en`;
  const panelId = `${base}-gloss`;

  useEffect(() => {
    if (open !== null) panelRef.current?.focus();
  }, [open]);

  const close = () => {
    const w = open;
    setOpen(null);
    if (w !== null) wordRefs.current[w]?.focus();
  };

  const narration = !line.speaker;
  return (
    <div
      data-testid="story-line"
      data-line-index={index}
      className={`min-w-0 rounded-2xl border-2 px-3.5 py-2.5 transition-shadow ${
        narration ? "border-transparent bg-sunk" : "border-line bg-surface"
      } ${active ? "ring-4 ring-brand/25" : ""}`}
    >
      {line.speaker && <div className="mb-0.5 text-xs font-extrabold tracking-wide text-muted uppercase">{line.speaker}</div>}
      <div className="flex items-start gap-2.5">
        <SpeakButton bn={line.bn} size="sm" className="mt-2" />
        <div className="min-w-0 flex-1">
          <p lang="bn" className="-mx-0.5 flex flex-wrap items-center gap-x-1 text-xl font-bold text-ink">
            {line.words.map((w, i) => (
              <Word
                key={i}
                word={w}
                expanded={open === i}
                controls={panelId}
                onToggle={() => setOpen((o) => (o === i ? null : i))}
                onEscape={close}
                buttonRef={(el) => {
                  wordRefs.current[i] = el;
                }}
              />
            ))}
          </p>
          <div className="text-sm font-semibold">
            <Translit tr={line.tr} />
          </div>
          <button
            type="button"
            aria-expanded={showEn}
            aria-controls={enId}
            onClick={() => setShowEn((s) => !s)}
            className="-ml-1 min-h-11 rounded-md px-1 text-sm font-extrabold text-brand-dark underline decoration-2 underline-offset-2"
          >
            {showEn ? "Hide translation" : "Show translation"}
          </button>
          {showEn && (
            <p id={enId} className="text-sm font-semibold text-pretty text-ink/80">
              {line.en}
            </p>
          )}
        </div>
      </div>
      {open !== null && line.words[open] && (
        <GlossCard id={panelId} word={line.words[open]} panelRef={panelRef} onClose={close} />
      )}
    </div>
  );
}

function Word({
  word,
  expanded,
  controls,
  onToggle,
  onEscape,
  buttonRef,
}: {
  word: StoryWord;
  expanded: boolean;
  controls: string;
  onToggle: () => void;
  onEscape: () => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
}) {
  const pre = word.pre && <span aria-hidden>{word.pre}</span>;
  const post = word.post && <span aria-hidden>{word.post}</span>;
  if (!word.glosses.length) {
    return (
      <span className="inline-flex min-h-11 items-center px-1">
        {word.pre}
        {word.text}
        {word.post}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center">
      {pre}
      <button
        ref={buttonRef}
        type="button"
        data-enter-native
        data-testid="story-word"
        aria-haspopup="dialog"
        aria-expanded={expanded}
        aria-controls={expanded ? controls : undefined}
        aria-label={`${word.text}: show meaning`}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Escape" && expanded) {
            e.preventDefault();
            onEscape();
          }
        }}
        className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-0.5 underline decoration-dotted decoration-2 underline-offset-[6px] ${
          expanded ? "bg-brand-light text-brand-dark decoration-brand" : "decoration-line-strong hover:bg-sunk"
        }`}
      >
        {word.text}
      </button>
      {post}
    </span>
  );
}

function GlossCard({
  id,
  word,
  panelRef,
  onClose,
}: {
  id: string;
  word: StoryWord;
  panelRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}) {
  const headingId = `${id}-h`;
  return (
    <div
      id={id}
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={headingId}
      tabIndex={-1}
      data-testid="story-gloss"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      className="animate-pop mt-2 rounded-2xl border-2 border-brand/30 bg-brand-light p-3 outline-none focus-visible:outline-3 focus-visible:outline-focus"
    >
      <h3 id={headingId} className="sr-only">
        Meaning of {word.text}
      </h3>
      <ul className="flex flex-col gap-2">
        {word.glosses.map((g) => (
          <li key={g.id} className="flex items-start gap-2.5">
            <SpeakButton bn={g.bn} size="sm" className="mt-1" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span lang="bn" className="text-lg font-bold text-ink">
                  {g.bn}
                </span>
                <span className="text-sm font-semibold text-muted italic">{g.tr}</span>
                {g.pos && <span className="chip bg-surface text-muted">{g.pos}</span>}
              </p>
              <p className="font-extrabold text-pretty text-ink" data-testid="story-gloss-en">
                {g.en}
                {g.alt?.length ? <span className="font-semibold text-muted"> · {g.alt.slice(0, 3).join(", ")}</span> : null}
              </p>
              {g.via && <p className="text-sm font-semibold text-muted">{g.via}</p>}
              {g.notes && <p className="text-sm font-semibold text-pretty text-muted">{g.notes}</p>}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex justify-end">
        <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">
          Close
        </button>
      </div>
    </div>
  );
}
