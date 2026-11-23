"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SpeakButton } from "@/components/SpeakButton";
import { CoinIcon } from "@/components/icons";
import { CountUp } from "@/components/motion/CountUp";
import { optionOrder, scoreStall, taka, type StallResult } from "@/lib/bazaar/engine";
import type { BazaarBank, BazaarStep, BnLine, Stall } from "@/lib/bazaar/types";
import { celebrate } from "@/lib/celebrate";
import { recordGameEvent } from "@/lib/game/storage";
import { playSfx, preloadSfx } from "@/lib/sfx";

type Phase = { kind: "pick" } | { kind: "play"; stall: Stall; step: number; right: boolean[]; chosen: number | null } | { kind: "done"; stall: Stall; result: StallResult };

/**
 * Bazaar: a short visit to a market stall. Ask the price, understand the number, haggle (or not),
 * and see what you paid. Every Bengali line is a sentence taught in the course.
 */
export function BazaarApp({ bank }: { bank: BazaarBank }) {
  const [phase, setPhase] = useState<Phase>({ kind: "pick" });
  const [visited, setVisited] = useState<Record<string, StallResult>>({});
  useEffect(() => preloadSfx(), []);

  const start = (stall: Stall) => setPhase({ kind: "play", stall, step: 0, right: [], chosen: null });

  const choose = (i: number) => {
    if (phase.kind !== "play" || phase.chosen !== null) return;
    const st = phase.stall.steps[phase.step];
    const ok = i === st.answer;
    playSfx(ok ? "correct" : "wrong");
    setPhase({ ...phase, chosen: i, right: [...phase.right, ok] });
  };

  const next = () => {
    if (phase.kind !== "play" || phase.chosen === null) return;
    if (phase.step + 1 < phase.stall.steps.length) {
      setPhase({ ...phase, step: phase.step + 1, chosen: null });
      return;
    }
    const result = scoreStall(bank, phase.stall, phase.right);
    recordGameEvent({ type: "bazaar", saved: result.saved, coins: result.coins });
    setVisited((v) => ({ ...v, [phase.stall.id]: result }));
    setPhase({ kind: "done", stall: phase.stall, result });
  };

  return (
    <AppShell>
      <AnimatePresence mode="wait">
        {phase.kind === "pick" && (
          <motion.div key="pick" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <h1 className="text-2xl font-black">The bazaar</h1>
            <p className="mt-1 font-semibold text-muted">
              Shop the way people do in Bangladesh: ask the price, catch the number, and haggle where it is expected. Every right answer earns taka coins, and a good haggle earns a bonus.
            </p>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {bank.stalls.map((s, i) => {
                const v = visited[s.id];
                return (
                  <motion.li key={s.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                    <motion.button
                      type="button"
                      onClick={() => start(s)}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.97 }}
                      className="card flex w-full flex-col items-start gap-1 p-4 text-left"
                    >
                      <Awning />
                      <span className="mt-2 text-lg font-black text-ink">{s.title}</span>
                      <span className="text-sm font-semibold text-muted">{s.intro}</span>
                      {v && (
                        <span className="chip mt-1 bg-brand-light text-brand-dark">
                          Paid {taka(v.paid)}
                          {v.saved > 0 ? `, saved ${taka(v.saved)}` : ""}
                        </span>
                      )}
                    </motion.button>
                  </motion.li>
                );
              })}
            </ul>
            <Link href="/practice" className="mt-6 inline-block font-extrabold text-brand-dark underline">
              Back to Practice
            </Link>
          </motion.div>
        )}

        {phase.kind === "play" && (
          <motion.div key={`play-${phase.stall.id}`} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
            <Play
              stall={phase.stall}
              step={phase.step}
              right={phase.right}
              chosen={phase.chosen}
              onChoose={choose}
              onNext={next}
              onQuit={() => setPhase({ kind: "pick" })}
            />
          </motion.div>
        )}

        {phase.kind === "done" && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <Summary stall={phase.stall} result={phase.result} onAgain={() => start(phase.stall)} onPick={() => setPhase({ kind: "pick" })} />
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}

/** Striped market awning (decoration). */
function Awning() {
  return (
    <svg width="100%" height="18" viewBox="0 0 120 18" preserveAspectRatio="none" aria-hidden className="rounded-t-lg">
      {Array.from({ length: 8 }, (_, i) => (
        <path key={i} d={`M${i * 15} 0h15v10a7.5 7.5 0 01-15 0z`} fill={i % 2 ? "var(--color-surface)" : i % 4 === 0 ? "var(--color-accent)" : "var(--color-brand)"} stroke="var(--color-line-strong)" strokeWidth=".6" />
      ))}
    </svg>
  );
}

/** What the price is at the start of step `i` (unknown until the price has been heard). */
function priceBefore(stall: Stall, step: number, right: boolean[]): number | null {
  const heard = stall.steps.findIndex((s) => s.kind === "listen");
  if (heard < 0 || step <= heard) return null;
  let p = stall.start;
  for (let i = 0; i < step; i++) {
    const s = stall.steps[i];
    if (s.kind === "choose" && s.price !== undefined && right[i]) p = s.price;
  }
  return p;
}

function Bubble({ line, reveal, from = "seller" }: { line: BnLine; reveal: boolean; from?: "seller" | "you" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 26 }}
      className={`flex max-w-[92%] items-start gap-3 rounded-2xl border-2 px-4 py-3 ${
        from === "seller" ? "self-start rounded-tl-sm border-sun/40 bg-sun-light" : "self-end rounded-tr-sm border-brand/30 bg-brand-light"
      }`}
    >
      <SpeakButton bn={line.bn} size="sm" />
      <span className="min-w-0">
        <span lang="bn" className="block text-xl font-bold text-ink">
          {line.bn}
        </span>
        <span className="block text-sm font-semibold text-muted">{line.tr}</span>
        {reveal && <span className="block text-sm font-bold text-ink/80">{line.en}</span>}
      </span>
    </motion.div>
  );
}

function Play({
  stall,
  step,
  right,
  chosen,
  onChoose,
  onNext,
  onQuit,
}: {
  stall: Stall;
  step: number;
  right: boolean[];
  chosen: number | null;
  onChoose: (i: number) => void;
  onNext: () => void;
  onQuit: () => void;
}) {
  const st: BazaarStep = stall.steps[step];
  const answered = chosen !== null;
  const ok = answered && chosen === st.answer;
  const price = priceBefore(stall, step, right);
  const after = answered && ok && st.kind === "choose" && st.price !== undefined ? st.price : price;
  const prev = step > 0 ? stall.steps[step - 1] : null;
  // What the seller last said: this step's own line, else their answer to your last line, else
  // their last line, so the conversation stays on screen.
  const context: BnLine | undefined =
    ("say" in st && st.say) ||
    (prev?.kind === "choose" && prev.reply && right[step - 1] ? prev.reply : undefined) ||
    (prev && "say" in prev ? prev.say : undefined);
  const order = useMemo(() => optionOrder(stall.id, step, st.kind === "listen" ? st.choices.length : st.options.length), [stall.id, step, st]);

  useEffect(() => {
    if (!answered) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !(e.target as HTMLElement | null)?.closest("a, button")) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answered, onNext]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onQuit} className="min-h-11 rounded-xl px-2 font-extrabold text-muted hover:text-ink">
          ← Stalls
        </button>
        <div className="flex gap-1.5" aria-label={`Step ${step + 1} of ${stall.steps.length}`} role="img">
          {stall.steps.map((_, i) => (
            <span key={i} className={`h-2.5 w-6 rounded-full ${i < right.length ? (right[i] ? "bg-brand" : "bg-accent") : i === step ? "bg-sun" : "bg-line"}`} />
          ))}
        </div>
        <PriceTag price={after} was={after !== price ? price : null} unit={stall.unit} />
      </div>

      <h1 className="text-xl font-black text-ink">{stall.title}</h1>

      <div className="flex min-h-24 flex-col gap-2">
        {context && <Bubble key={context.bn} line={context} reveal={answered || context !== ("say" in st ? st.say : undefined)} />}
        {/* After a right answer: your line, then the seller's reply. */}
        {answered && ok && st.kind === "choose" && <Bubble key="you" line={st.options[st.answer]} reveal from="you" />}
        {answered && ok && st.kind === "choose" && st.reply && <Bubble key="reply" line={st.reply} reveal />}
      </div>

      <p className="text-lg font-black text-ink">{st.prompt}</p>

      <ul className="flex flex-col gap-2.5">
        {order.map((i) => {
          const isAnswer = i === st.answer;
          const isChosen = i === chosen;
          const tone = !answered
            ? "border-line-strong bg-surface hover:border-brand"
            : isAnswer
              ? "border-brand bg-brand-light"
              : isChosen
                ? "border-accent bg-accent-light"
                : "border-line bg-surface opacity-70";
          return (
            <li key={i}>
              <motion.button
                type="button"
                disabled={answered}
                onClick={() => onChoose(i)}
                whileTap={!answered ? { scale: 0.98 } : undefined}
                animate={answered && isChosen && !isAnswer ? { x: [0, -8, 8, -5, 5, 0] } : { x: 0 }}
                transition={{ duration: 0.4 }}
                className={`flex min-h-14 w-full flex-col items-start rounded-2xl border-2 px-4 py-3 text-left transition-colors ${tone}`}
              >
                {st.kind === "listen" ? (
                  <span className="text-lg font-black text-ink">{st.choices[i]}</span>
                ) : (
                  <>
                    <span lang="bn" className="text-lg font-bold text-ink">
                      {st.options[i].bn}
                    </span>
                    <span className="text-sm font-semibold text-muted">{st.options[i].tr}</span>
                    {answered && <span className="text-sm font-bold text-ink/80">{st.options[i].en}</span>}
                  </>
                )}
              </motion.button>
            </li>
          );
        })}
      </ul>

      <AnimatePresence>
        {answered && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-2xl px-4 py-3 ${ok ? "bg-brand-light text-brand-dark" : "bg-accent-light text-accent-dark"}`}
            role="status"
          >
            <p className="text-lg font-black">{ok ? "Nicely said" : "Not quite"}</p>
            <p className="font-semibold text-ink">{st.why}</p>
            <motion.button type="button" autoFocus onClick={onNext} className={`btn mt-3 w-full ${ok ? "btn-primary" : "btn-danger"}`} whileTap={{ scale: 0.97 }}>
              {step + 1 < stall.steps.length ? "Continue" : "Pay and finish"}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Price label that flips to the new price, with the old one struck through. */
function PriceTag({ price, was, unit }: { price: number | null; was: number | null; unit: string }) {
  return (
    <span className="flex min-w-20 items-center justify-end gap-1.5 text-right" aria-live="polite">
      {price === null ? (
        <span className="rounded-lg bg-sunk px-2 py-1 text-sm font-black text-muted">৳ ?</span>
      ) : (
        <>
          {was !== null && <span className="text-sm font-bold text-muted line-through">{taka(was)}</span>}
          <motion.span
            key={price}
            initial={{ rotateX: 90, opacity: 0 }}
            animate={{ rotateX: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="rounded-lg bg-sun px-2 py-1 text-sm font-black text-white"
          >
            {taka(price)}
            {unit ? ` ${unit}` : ""}
          </motion.span>
        </>
      )}
    </span>
  );
}

function Summary({ stall, result, onAgain, onPick }: { stall: Stall; result: StallResult; onAgain: () => void; onPick: () => void }) {
  const allRight = result.right.every(Boolean);
  useEffect(() => {
    const t = window.setTimeout(() => {
      celebrate(allRight ? "big" : "small");
      if (result.coins) playSfx("coin");
    }, 250);
    return () => window.clearTimeout(t);
  }, [allRight, result.coins]);
  return (
    <div className="flex flex-col items-center gap-5 pt-6 text-center">
      <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 14 }}>
        <CoinIcon size={84} />
      </motion.div>
      <div>
        <h1 className="text-3xl font-black text-brand-dark">{allRight ? "A great deal" : "Deal done"}</h1>
        <p className="mt-1 text-lg font-extrabold text-ink">
          You bought {stall.item} for {taka(result.paid)}
          {stall.unit && result.asked === stall.start ? ` ${stall.unit}` : ""}.
        </p>
        {result.saved > 0 ? (
          <p className="font-bold text-brand-dark">Haggling saved you {taka(result.saved)}.</p>
        ) : (
          <p className="font-semibold text-muted">{stall.id === "tea" ? "Tea is never haggled over. Good call." : "No discount this time."}</p>
        )}
      </div>
      <p className="flex items-center gap-2 rounded-2xl bg-sun-light px-5 py-3 text-xl font-black text-sun-dark">
        <CoinIcon />
        <span>
          +<CountUp to={result.coins} delay={0.4} /> taka coins
        </span>
      </p>
      <p className="text-sm font-bold text-muted">
        {result.right.filter(Boolean).length} of {result.right.length} right
      </p>
      <div className="flex w-full max-w-sm flex-col gap-3">
        <button type="button" autoFocus onClick={onPick} className="btn btn-primary w-full">
          Visit another stall
        </button>
        <button type="button" onClick={onAgain} className="btn btn-ghost w-full">
          Try this stall again
        </button>
      </div>
    </div>
  );
}
