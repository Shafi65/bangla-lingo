"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { AppShell } from "../AppShell";
import { SpeakButton } from "../SpeakButton";
import { Translit } from "../Translit";
import type { DictData, DictEntry } from "@/lib/dictionary/data";

const PAGE = 40;
const BENGALI = /[ঀ-৿]/;

/** Latin search form: lowercase, diacritics and punctuation removed. */
function latin(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ঀ-৿]+/g, " ")
    .trim();
}

interface Indexed {
  e: DictEntry;
  bn: string;
  /** tr + en + alternative glosses + Kolkata transliteration, in Latin search form. */
  lat: string;
  /** Exact-match keys (for ranking). */
  keys: string[];
}

function score(x: Indexed, q: string, bengali: boolean): number {
  if (bengali) {
    if (x.bn === q) return 0;
    return x.bn.startsWith(q) ? 1 : 2;
  }
  if (x.keys.includes(q)) return 0;
  if (x.keys.some((k) => k.startsWith(q + " ") || k.startsWith(q))) return 1;
  return 2;
}

export function Dictionary({ data }: { data: DictData }) {
  const [query, setQuery] = useState("");
  const [unit, setUnit] = useState("");
  const [pos, setPos] = useState("");
  const [shown, setShown] = useState(PAGE);
  const deferred = useDeferredValue(query);

  const index = useMemo<Indexed[]>(
    () =>
      data.entries.map((e) => {
        const keys = [e.tr, e.en, ...(e.alt ?? [])].map(latin);
        return {
          e,
          bn: (e.bn + " " + (e.k ?? "")).normalize("NFC"),
          lat: latin([e.tr, e.en, ...(e.alt ?? []), e.k ?? ""].join(" ")),
          keys,
        };
      }),
    [data],
  );

  const results = useMemo(() => {
    const raw = deferred.trim();
    const bengali = BENGALI.test(raw);
    const q = bengali ? raw.normalize("NFC") : latin(raw);
    const unitIdx = unit === "" ? -1 : Number(unit);
    const out: { x: Indexed; s: number }[] = [];
    for (const x of index) {
      if (unitIdx >= 0 && x.e.u !== unitIdx) continue;
      if (pos && x.e.pos !== pos) continue;
      let s = 0;
      if (q) {
        const tokens = q.split(" ");
        const hay = bengali ? x.bn : " " + x.lat;
        if (!tokens.every((t) => hay.includes(bengali ? t : " " + t))) continue;
        s = score(x, q, bengali);
      }
      out.push({ x, s });
    }
    if (q) out.sort((a, b) => a.s - b.s); // stable: keeps course order within a rank
    return out.map((r) => r.x.e);
  }, [index, deferred, unit, pos]);

  const visible = results.slice(0, shown);
  const reset = () => setShown(PAGE);
  const field =
    "min-h-12 w-full rounded-2xl border-2 border-line bg-surface px-3 text-base font-semibold text-ink";

  return (
    <AppShell>
      <h1 className="text-3xl font-black">Dictionary</h1>
      <p className="mt-1 text-lg font-semibold text-muted">
        Every word and letter in the course. Search in Bengali, in Roman letters or in English.
      </p>

      <div className="sticky top-[var(--header-h)] z-10 -mx-4 mt-4 space-y-2 bg-paper px-4 py-2">
        <label className="block">
          <span className="sr-only">Search the dictionary</span>
          <input
            type="search"
            data-enter-native
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              reset();
            }}
            placeholder="Search: ami, আমি, thank you"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className={field}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="sr-only">Filter by unit</span>
            <select
              value={unit}
              onChange={(e) => {
                setUnit(e.target.value);
                reset();
              }}
              className={field}
            >
              <option value="">All units</option>
              {data.units.map((u, i) => (
                <option key={u.id} value={i}>
                  {u.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Filter by part of speech</span>
            <select
              value={pos}
              onChange={(e) => {
                setPos(e.target.value);
                reset();
              }}
              className={field}
            >
              <option value="">All types</option>
              {data.pos.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <p role="status" aria-live="polite" className="mt-3 text-sm font-bold text-muted">
        {results.length === 0
          ? "No matches"
          : `${results.length} ${results.length === 1 ? "entry" : "entries"}`}
      </p>

      {results.length === 0 ? (
        <div className="mt-4 rounded-3xl border-2 border-dashed border-line bg-surface p-6 text-center">
          <p className="text-xl font-black">Nothing found</p>
          <p className="mt-1 font-semibold text-muted">Try a shorter search or clear the filters.</p>
        </div>
      ) : (
        <ul className="mt-2 space-y-2">
          {visible.map((e) => (
            <li key={e.id} className="rounded-2xl border-2 border-line bg-surface p-3">
              <div className="flex items-start gap-3">
                <SpeakButton bn={e.bn} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0">
                    <span lang="bn" className="text-2xl font-bold break-words text-ink">
                      {e.bn}
                    </span>
                    <span className="text-base font-semibold">
                      <Translit tr={e.tr} />
                    </span>
                  </div>
                  <p className="font-bold text-ink">{e.en}</p>
                  {e.alt && e.alt.length > 0 && (
                    <p className="text-sm font-semibold text-muted">Also: {e.alt.join(", ")}</p>
                  )}
                  {e.k && (
                    <p className="mt-1 text-sm font-semibold text-ink/80">
                      <span className="font-extrabold">Kolkata:</span> <span lang="bn">{e.k}</span>
                    </p>
                  )}
                  {e.notes && <p className="mt-1 text-sm font-semibold text-muted">{e.notes}</p>}
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold">
                    <span className="rounded-full bg-brand-light px-2 py-0.5 text-brand-dark">{e.pos}</span>
                    <Link
                      href={`/guide/${data.units[e.u].id}#${e.l}`}
                      className="text-brand-dark underline"
                    >
                      {data.units[e.u].title}
                      {data.lessons[e.l] ? ` · ${data.lessons[e.l]}` : ""}
                    </Link>
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {results.length > shown && (
        <button
          type="button"
          data-enter-native
          onClick={() => setShown((n) => n + PAGE)}
          className="btn btn-ghost mt-4 w-full"
        >
          Show more ({results.length - shown} left)
        </button>
      )}
    </AppShell>
  );
}
