"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { flattenLetters, type WriteGroup, type WriteLetter } from "@/lib/write/letters";
import { useWriteProgress, type WriteState } from "@/lib/write/storage";
import { PracticePanel } from "./PracticePanel";

const STATE_TEXT: Record<WriteState, string> = {
  new: "not started",
  traced: "traced",
  written: "written from memory",
};

function Tile({ letter, state, onOpen }: { letter: WriteLetter; state: WriteState; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`letter-${letter.id}`}
      data-state={state}
      aria-label={`${letter.glyph}, ${letter.tr}, ${STATE_TEXT[state]}`}
      className={`relative flex min-h-14 w-full min-w-11 items-center justify-center rounded-2xl border-2 py-2 hover:bg-sunk ${
        state === "written"
          ? "border-brand bg-brand-light"
          : state === "traced"
            ? "border-brand bg-surface"
            : "border-line-strong bg-surface"
      }`}
    >
      <span lang="bn" aria-hidden className="font-bengali text-3xl leading-none font-bold text-ink">
        {letter.glyph}
      </span>
      {state !== "new" && (
        <span
          aria-hidden
          className={`absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-brand px-0.5 text-[0.6875rem] leading-none font-black ${
            state === "written" ? "bg-brand text-white" : "bg-surface text-brand-dark"
          }`}
        >
          {state === "written" ? "✓✓" : "✓"}
        </span>
      )}
    </button>
  );
}

export function WriteApp({ groups }: { groups: WriteGroup[] }) {
  const progress = useWriteProgress();
  const letters = useMemo(() => flattenLetters(groups), [groups]);
  const [current, setCurrent] = useState<number | null>(null);

  const stateOf = (id: string): WriteState => progress.letters[id] ?? "new";
  const traced = letters.filter((l) => stateOf(l.id) !== "new").length;
  const written = letters.filter((l) => stateOf(l.id) === "written").length;

  return (
    <AppShell>
      <h1 className="text-2xl font-black text-balance">Write the letters</h1>
      {current === null ? (
        <>
          <p className="mt-1 font-semibold text-pretty text-muted">
            Watch a letter, trace it, then write it from memory. Works with a finger, a stylus or a mouse.
          </p>
          {letters.length === 0 ? (
            <p className="mt-6 rounded-2xl border-2 border-line bg-surface p-4 font-semibold text-muted">
              The script lessons are not available yet, so there are no letters to practise.
            </p>
          ) : (
            <>
              <p className="mt-3 text-sm font-extrabold text-muted" data-testid="write-summary">
                {traced} of {letters.length} traced · {written} written from memory
              </p>
              <p className="mt-1 text-xs font-semibold text-muted">
                A single tick means traced; two ticks mean written from memory.
              </p>
              {groups.map((g) => (
                <section key={g.id} className="mt-6" aria-labelledby={`wg-${g.id}`}>
                  <h2 id={`wg-${g.id}`} className="text-lg font-black text-brand-dark">
                    {g.title}
                  </h2>
                  {g.lessons.map((l) => (
                    <div key={l.id} className="mt-3">
                      <h3 className="text-sm font-extrabold text-muted">{l.title}</h3>
                      <ul className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-2.5">
                        {l.letters.map((letter) => (
                          <li key={letter.id}>
                            <Tile
                              letter={letter}
                              state={stateOf(letter.id)}
                              onOpen={() => setCurrent(letters.findIndex((x) => x.id === letter.id))}
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>
              ))}
            </>
          )}
        </>
      ) : (
        <PracticePanel
          key={letters[current].id}
          letter={letters[current]}
          index={current}
          total={letters.length}
          onPrev={() => setCurrent(Math.max(0, current - 1))}
          onNext={() => setCurrent(Math.min(letters.length - 1, current + 1))}
          onBack={() => setCurrent(null)}
        />
      )}
    </AppShell>
  );
}
