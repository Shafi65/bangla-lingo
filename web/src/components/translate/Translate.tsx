"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AppShell } from "../AppShell";
import { CourseResults } from "./CourseResults";
import { MachineCard } from "./MachineCard";
import { recentStore, pushRecent, requestMachine, type MachineState } from "@/lib/translate/client";
import { detectLang, prepare, romanizeWithCourse, searchCourse } from "@/lib/translate/search";
import type { Lang, TranslateData } from "@/lib/translate/types";

export const MAX_CHARS = 500;
const NAMES: Record<Lang, { en: string; native: string }> = {
  en: { en: "English", native: "English" },
  bn: { en: "Bengali", native: "বাংলা" },
};
const EXAMPLES = ["thank you", "কেমন আছেন?", "ami", "water", "where is the market"];
const other = (l: Lang): Lang => (l === "en" ? "bn" : "en");

function SwapIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5" />
    </svg>
  );
}

function Chip({ children, onClick, bn }: { children: string; onClick: () => void; bn?: boolean }) {
  return (
    <button
      type="button"
      data-enter-native
      onClick={onClick}
      lang={bn ? "bn" : undefined}
      className="inline-flex min-h-9 items-center rounded-full border-2 border-line bg-surface px-3.5 text-[0.9375rem] font-bold text-ink hover:border-brand/40 hover:bg-brand-light/50"
    >
      {children}
    </button>
  );
}

export function Translate({ data }: { data: TranslateData }) {
  const [text, setText] = useState("");
  const [chosen, setChosen] = useState<Lang>("en");
  const [manual, setManual] = useState(false);
  const [machine, setMachine] = useState<MachineState>({ s: "idle" });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recent = useSyncExternalStore(recentStore.subscribe, recentStore.get, recentStore.server);

  const detected = detectLang(text);
  const from: Lang = manual ? chosen : (detected ?? chosen);
  const to = other(from);

  const px = useMemo(() => prepare(data.items), [data]);
  const deferred = useDeferredValue(text);
  const result = useMemo(() => searchCourse(px, deferred), [px, deferred]);

  const trimmed = text.trim();
  const stale = machine.s === "done" && machine.source !== trimmed;
  const romanized = machine.s === "done" && machine.to === "bn" ? romanizeWithCourse(px, machine.text) : null;

  // Remember a lookup once the learner pauses on something the course knows.
  useEffect(() => {
    const t = deferred.trim();
    if (t.length < 2 || result.kind === "empty") return;
    const found = result.kind === "words" ? result.words.some((w) => w.hit) : result.hits.length > 0;
    if (!found) return;
    const timer = window.setTimeout(() => recentStore.set(pushRecent(recentStore.get(), t)), 2000);
    return () => window.clearTimeout(timer);
  }, [deferred, result]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const translate = async (value = text, dir: Lang = from) => {
    const t = value.trim();
    if (!t) {
      inputRef.current?.focus();
      return;
    }
    recentStore.set(pushRecent(recentStore.get(), t));
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setMachine({ s: "loading" });
    const next = await requestMachine(t.slice(0, MAX_CHARS), dir, other(dir), ctrl.signal);
    if (!ctrl.signal.aborted) setMachine(next);
  };

  const fill = (value: string) => {
    setText(value.slice(0, MAX_CHARS));
    setManual(false);
    setMachine({ s: "idle" });
    inputRef.current?.focus();
  };

  const clear = () => {
    abortRef.current?.abort();
    fill("");
  };

  const swap = () => {
    const next = other(from);
    setChosen(next);
    setManual(true);
    if (machine.s === "done" && !stale) {
      setText(machine.text.slice(0, MAX_CHARS));
      setMachine({ s: "idle" });
    }
  };

  const status =
    result.kind === "empty"
      ? ""
      : result.kind === "words"
        ? `${result.words.filter((w) => w.hit).length} of ${result.words.length} words found in the course`
        : result.hits.length === 0
          ? "Not in the course yet"
          : `${result.total} course ${result.total === 1 ? "result" : "results"}`;

  return (
    <AppShell>
      <h1 className="text-3xl font-black">Translate</h1>
      <p className="mt-1 text-lg font-semibold text-muted">
        Course words appear as you type, in English, বাংলা or Roman letters.
      </p>

      <form
        className="mt-5 rounded-[var(--radius-panel)] border-2 border-line bg-surface shadow-[var(--shadow-lift)] focus-within:border-brand/50"
        onSubmit={(e) => {
          e.preventDefault();
          void translate();
        }}
      >
        <div className="flex items-center gap-2 border-b-2 border-line px-3 py-2" role="group" aria-label="Translation direction">
          <span className="flex-1 text-center text-base font-black text-ink" lang={from === "bn" ? "bn" : undefined}>
            {NAMES[from].native}
          </span>
          <button
            type="button"
            data-enter-native
            onClick={swap}
            aria-label={`Swap: translate ${NAMES[to].en} to ${NAMES[from].en}`}
            title="Swap languages"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-light text-brand-dark transition-transform hover:brightness-95 active:rotate-180 motion-reduce:transition-none"
          >
            <SwapIcon />
          </button>
          <span className="flex-1 text-center text-base font-black text-muted" lang={to === "bn" ? "bn" : undefined}>
            {NAMES[to].native}
          </span>
        </div>
        <p className="sr-only" aria-live="polite">
          {`Translating ${NAMES[from].en} to ${NAMES[to].en}`}
        </p>

        <label className="block px-4 pt-3">
          <span className="sr-only">Text to translate, {NAMES[from].en}</span>
          <textarea
            ref={inputRef}
            data-enter-native
            value={text}
            maxLength={MAX_CHARS}
            rows={2}
            lang={from === "bn" ? "bn" : "en"}
            onChange={(e) => {
              setText(e.target.value);
              if (!e.target.value.trim()) setManual(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void translate();
              }
            }}
            placeholder={from === "bn" ? "বাংলায় লিখুন" : "Type a word or sentence"}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="go"
            className="focus-border block max-h-64 min-h-[4.5rem] w-full resize-none bg-transparent text-2xl leading-snug font-bold text-ink placeholder:font-semibold placeholder:text-muted/70 [field-sizing:content]"
          />
        </label>

        <div className="flex items-center gap-2 px-3 pt-1 pb-3">
          <span className={`pl-1 text-xs font-bold tabular-nums ${text.length >= MAX_CHARS ? "text-accent-dark" : "text-muted"}`}>
            {text.length}/{MAX_CHARS}
          </span>
          {text && (
            <button
              type="button"
              data-enter-native
              onClick={clear}
              className="inline-flex h-9 items-center gap-1 rounded-xl px-2.5 text-sm font-extrabold text-muted hover:bg-sunk hover:text-ink"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
              Clear
            </button>
          )}
          <button type="submit" data-enter-native className="btn btn-primary ml-auto min-h-10 px-5 py-2 text-base" disabled={machine.s === "loading"}>
            {machine.s === "loading" ? "Translating…" : "Translate"}
          </button>
        </div>
      </form>

      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>

      {!trimmed && (
        <div className="mt-6 space-y-5">
          <div>
            <h2 className="text-base font-black">Try</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <Chip key={ex} onClick={() => fill(ex)} bn={/[ঀ-৿]/.test(ex)}>
                  {ex}
                </Chip>
              ))}
            </div>
            <p className="mt-2 text-sm font-semibold text-muted">
              No Bengali keyboard? Type the sounds: <em>dhonnobad</em>, <em>kemon achen</em>.
            </p>
          </div>
          {recent.length > 0 && (
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-base font-black">Recent</h2>
                <button
                  type="button"
                  data-enter-native
                  onClick={() => recentStore.set([])}
                  className="rounded-lg px-1 text-sm font-extrabold text-muted underline hover:text-ink"
                >
                  Clear recent
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {recent.map((r) => (
                  <Chip key={r} onClick={() => fill(r)} bn={/[ঀ-৿]/.test(r)}>
                    {r}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {trimmed && <CourseResults result={result} data={data} />}
      {trimmed && <MachineCard state={machine} romanized={romanized} stale={stale} />}

      <p className="mt-8 border-t-2 border-line pt-4 text-center">
        <Link href="/dictionary" className="font-extrabold text-brand-dark underline decoration-2 underline-offset-2">
          Browse all {data.items.filter((i) => !i.s && !i.a).length} course words in the dictionary
        </Link>
      </p>
    </AppShell>
  );
}
