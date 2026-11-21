"use client";

import { Translit } from "@/components/Translit";
import type { FormalityBank, FormalityStore } from "@/lib/formality/types";

const TONE = ["border-sun/50 bg-sun-light", "border-brand/30 bg-brand-light", "border-line-strong bg-surface"];

/** The three pronouns side by side with their matching forms, then the tiers and a start button. */
export function Intro({
  bank,
  store,
  ready,
  onStart,
  headingRef,
}: {
  bank: FormalityBank;
  store: FormalityStore;
  ready: boolean;
  onStart: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const unlocked = Math.min(store.unlocked, bank.tiers.length);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-black text-pretty outline-none">
          Formality trainer
        </h1>
        <p className="mt-1 font-semibold text-pretty text-muted">
          Bengali has three words for &ldquo;you&rdquo;. Who you are talking to decides which one, and the verb changes with it.
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-3" aria-label="The three words for you">
        {bank.intro.map((c, i) => (
          <li key={c.label} className={`rounded-3xl border-2 p-4 ${TONE[i % TONE.length]}`} data-testid="formality-intro-card">
            <p className="text-xs font-black tracking-wide text-muted uppercase">{c.label}</p>
            <p lang="bn" className="mt-1 text-3xl font-bold text-ink">
              {c.pronoun.bn}
            </p>
            <Translit tr={c.pronoun.tr} className="text-sm font-semibold" />
            <p className="mt-2 text-sm font-semibold text-pretty text-ink">{c.use}</p>
            <dl className="mt-3 flex flex-col gap-1.5 border-t-2 border-line pt-3">
              {c.forms.map((f) => (
                <div key={f.bn} className="flex items-baseline justify-between gap-2">
                  <dt className="min-w-0">
                    <span lang="bn" className="text-lg font-bold">
                      {f.bn}
                    </span>{" "}
                    <Translit tr={f.tr} className="text-xs font-semibold" />
                  </dt>
                  <dd className="shrink-0 text-sm font-bold text-muted">{f.en}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>

      <section aria-labelledby="formality-tiers" className="card p-4">
        <h2 id="formality-tiers" className="text-lg font-black">
          Levels
        </h2>
        <p className="mt-0.5 text-sm font-semibold text-muted">
          Each round has {bank.roundSize} questions. Score {bank.unlockScore} or more to open the next level.
        </p>
        <ol className="mt-3 flex flex-col gap-2">
          {bank.tiers.map((t) => {
            const open = ready && t.id <= unlocked;
            const best = store.best[String(t.id)];
            return (
              <li
                key={t.id}
                data-testid={`formality-tier-${t.id}`}
                data-unlocked={open ? "true" : "false"}
                className={`flex items-start gap-3 rounded-2xl px-3 py-2.5 ${open ? "bg-sunk" : "opacity-60"}`}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black ${
                    open ? "bg-brand text-white" : "bg-line text-muted"
                  }`}
                >
                  {open ? t.id : <LockIcon />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold">
                    {t.title}
                    <span className="sr-only">{open ? " (open)" : " (locked)"}</span>
                  </p>
                  <p className="text-sm font-semibold text-pretty text-muted">{t.description}</p>
                </div>
                {open && best !== undefined && (
                  <span className="chip shrink-0 bg-brand-light text-brand-dark">
                    Best {best}/{bank.roundSize}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <button type="button" className="btn btn-primary w-full" onClick={onStart} disabled={!ready}>
        {store.rounds > 0 ? "Play a round" : "Start"}
      </button>
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" />
      <path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="2.4" />
    </svg>
  );
}
