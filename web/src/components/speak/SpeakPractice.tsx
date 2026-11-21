"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useProgress } from "@/lib/progress";
import { useNow } from "@/lib/review";
import { itemKey, buildSets, RECENT_SET_ID, type SpeakData } from "@/lib/speak/items";
import { RATING_LABELS, recordRating, type Rating } from "@/lib/speak/history";
import { AppShell } from "../AppShell";
import { ShadowCard } from "./ShadowCard";

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}
const useOnline = () =>
  useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

export function SpeakPractice({ data }: { data: SpeakData }) {
  const progress = useProgress();
  const now = useNow(); // 0 until the client has mounted (progress is empty during prerender)
  const online = useOnline();
  const sets = useMemo(() => buildSets(data, progress.completed), [data, progress.completed]);

  const [choice, setChoice] = useState<string>(RECENT_SET_ID);
  // `session` is set once the learner presses Start; the set is frozen so progress changes mid-run don't shuffle it.
  const [session, setSession] = useState<{ id: string; run: number } | null>(null);
  const [index, setIndex] = useState(0);
  const [tally, setTally] = useState<[number, number, number]>([0, 0, 0]);
  const [moved, setMoved] = useState(false); // moved on at least once: focus the next card
  const [message, setMessage] = useState("");
  const say = useCallback((m: string) => setMessage(m), []);

  const active = session ? sets.find((s) => s.id === session.id) : undefined;
  const selected = sets.find((s) => s.id === choice) ?? sets[0];

  function start() {
    if (!selected) return;
    setSession((s) => ({ id: selected.id, run: (s?.run ?? 0) + 1 }));
    setIndex(0);
    setTally([0, 0, 0]);
    setMoved(false);
    setMessage(`${selected.title}: ${selected.items.length} phrases.`);
  }
  function leave() {
    setSession(null);
    setMessage("");
  }
  function advance(note: string) {
    if (!active) return;
    const next = index + 1;
    setIndex(next);
    setMoved(true);
    setMessage(
      next >= active.items.length ? `${note} Set finished.` : `${note} Phrase ${next + 1} of ${active.items.length}.`,
    );
  }
  function rate(r: Rating) {
    if (!active) return;
    recordRating(itemKey(active.items[index]), r);
    setTally((t) => t.map((n, i) => (i === r ? n + 1 : n)) as [number, number, number]);
    advance(`Rated ${RATING_LABELS[r]}.`);
  }

  let body;
  if (now === 0) {
    body = <div className="mt-6 h-48 animate-pulse rounded-3xl bg-surface" aria-hidden />;
  } else if (sets.length === 0) {
    body = (
      <div className="card mt-6 p-6 text-center" data-testid="speak-empty">
        <p className="text-xl font-black">Nothing to practise yet</p>
        <p className="mt-1 font-semibold text-muted">
          {data.items.length === 0
            ? "No recorded clips are available in this build."
            : "Finish a lesson and its sentences will show up here to say out loud."}
        </p>
        <Link href="/" className="btn btn-primary mt-5 w-full">
          Go to the course
        </Link>
      </div>
    );
  } else if (active && session) {
    const total = active.items.length;
    if (index >= total) {
      body = (
        <div className="card mt-6 p-6 text-center" data-testid="speak-summary">
          <p className="text-2xl font-black">Set finished</p>
          <p className="mt-1 font-semibold text-muted">{active.title}</p>
          <ul className="mt-4 grid grid-cols-3 gap-2" aria-label="Your ratings">
            {RATING_LABELS.map((l, i) => (
              <li key={l} className="rounded-2xl border-2 border-line bg-surface px-2 py-3">
                <span className="block text-2xl font-black">{tally[i]}</span>
                <span className="block text-xs font-bold text-muted">{l}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-primary mt-5 w-full" onClick={start}>
            Practise this set again
          </button>
          <button type="button" className="btn btn-ghost mt-3 w-full" onClick={leave}>
            Choose another set
          </button>
        </div>
      );
    } else {
      body = (
        <div className="mt-4">
          <div className="mb-4 flex items-center gap-3">
            <button type="button" className="min-h-11 rounded-xl px-2 text-base font-extrabold text-muted underline" onClick={leave}>
              Back to sets
            </button>
            <div
              className="h-3 flex-1 overflow-hidden rounded-full bg-line"
              role="progressbar"
              aria-label="Set progress"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={index}
            >
              <div className="h-full rounded-full bg-brand" style={{ width: `${(index / total) * 100}%` }} />
            </div>
          </div>
          <ShadowCard
            key={`${session.run}:${index}`}
            item={active.items[index]}
            position={index + 1}
            total={total}
            online={online}
            say={say}
            onRate={rate}
            onSkip={() => advance("Skipped.")}
            autoFocus={moved}
          />
        </div>
      );
    }
  } else {
    body = (
      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
      >
        <fieldset>
          <legend className="mb-3 text-lg font-black">Choose a set</legend>
          <div className="flex flex-col gap-2">
            {sets.map((s) => (
              <label
                key={s.id}
                className="card flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3 has-[:checked]:border-brand has-[:checked]:bg-brand-light has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
              >
                <input
                  type="radio"
                  name="speak-set"
                  value={s.id}
                  checked={(selected?.id ?? "") === s.id}
                  onChange={() => setChoice(s.id)}
                  className="h-5 w-5 shrink-0 accent-brand"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-extrabold">{s.title}</span>
                  <span className="block text-sm font-semibold text-muted">{s.subtitle}</span>
                </span>
                <span className="chip bg-sunk text-muted">{s.items.length}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" className="btn btn-primary mt-5 w-full" data-testid="speak-start">
          Start
        </button>
      </form>
    );
  }

  return (
    <AppShell>
      <h1 className="text-3xl font-black">Speaking practice</h1>
      <p className="mt-1 text-lg font-semibold text-muted">Listen, say it out loud, then compare your voice with the native clip.</p>
      {!online && (
        <p className="mt-4 rounded-2xl bg-sun-light p-3 text-sm font-bold text-sun-dark" role="note" data-testid="speak-offline">
          You are offline. Clips you have downloaded still play, and recording works without a connection.
        </p>
      )}
      {body}
      <p className="mt-6 text-sm font-semibold text-muted" data-testid="speak-privacy">
        Your recordings stay on this device, in memory only: nothing is uploaded or saved, and each one is discarded when you move on.
      </p>
      <p role="status" aria-live="polite" className="sr-only" data-testid="speak-status">
        {message}
      </p>
    </AppShell>
  );
}
