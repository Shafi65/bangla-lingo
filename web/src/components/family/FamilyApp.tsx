"use client";

import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Translit } from "@/components/Translit";
import { addressOf, relationById, relationOrder, termOf, varietyOf, whoLabel } from "@/lib/family/compose";
import { updateFamily, useFamilyStore } from "@/lib/family/storage";
import type { FamilyPerson, KinData } from "@/lib/family/types";
import { AddRelative } from "./AddRelative";
import { FamilyQuiz } from "./FamilyQuiz";
import { PersonCard } from "./PersonCard";

export type AddRequest = { group?: string; preset?: Record<string, string>; linkedTo?: string };

type View = { kind: "tree" } | { kind: "person"; id: string } | { kind: "add"; req: AddRequest; back: View } | { kind: "quiz" };

const GENS: { gen: number; title: string }[] = [
  { gen: 2, title: "Grandparents" },
  { gen: 1, title: "Parents, aunts and uncles" },
  { gen: 0, title: "Your generation" },
  { gen: -1, title: "Children, nieces and nephews" },
];

/**
 * My family: the learner builds their own tree with a guided "Add a relative" flow, and each person's card
 * teaches the exact kin term, pronoun and phrases. Everything is stored on this device only
 * (banglalingo.family.v1); it never touches lesson progress, XP or the streak.
 */
export function FamilyApp({ kin }: { kin: KinData }) {
  const { store, ready } = useFamilyStore();
  const [view, setView] = useState<View>({ kind: "tree" });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const variety = varietyOf(kin, store);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [view]);

  const person = view.kind === "person" ? store.people.find((p) => p.id === view.id) : undefined;
  // A person removed here or in another tab: fall back to the tree.
  const showTree = view.kind === "tree" || (view.kind === "person" && ready && !person);

  const openAdd = (req: AddRequest) => setView({ kind: "add", req, back: view.kind === "add" ? view.back : view });

  return (
    <AppShell>
      {showTree && (
        <TreeView kin={kin} people={store.people} ready={ready} variety={variety} headingRef={headingRef}
          onOpen={(id) => setView({ kind: "person", id })} onAdd={openAdd} onQuiz={() => setView({ kind: "quiz" })} />
      )}
      {view.kind === "add" && (
        <AddRelative
          kin={kin}
          variety={variety}
          req={view.req}
          people={store.people}
          headingRef={headingRef}
          onCancel={() => setView(view.back)}
          onAdded={(id) => setView({ kind: "person", id })}
        />
      )}
      {view.kind === "person" && person && (
        <PersonCard
          key={person.id}
          kin={kin}
          person={person}
          people={store.people}
          variety={variety}
          headingRef={headingRef}
          onBack={() => setView({ kind: "tree" })}
          onAdd={openAdd}
          onOpen={(id) => setView({ kind: "person", id })}
        />
      )}
      {view.kind === "quiz" && <FamilyQuiz kin={kin} store={store} headingRef={headingRef} onDone={() => setView({ kind: "tree" })} />}
    </AppShell>
  );
}

function VarietyToggle({ kin, variety }: { kin: KinData; variety: string }) {
  return (
    <fieldset className="card p-4">
      <legend className="sr-only">Family words</legend>
      <p className="text-sm font-black" aria-hidden>
        Family words
      </p>
      <p className="mt-0.5 text-sm font-semibold text-pretty text-muted">
        Families vary. Pick the words closest to yours; you can change any person&apos;s word on their card.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {kin.varieties.map((v) => (
          <label
            key={v.id}
            className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border-2 px-3 py-2.5 ${
              variety === v.id ? "border-brand bg-brand-light" : "border-line-strong bg-surface hover:bg-sunk"
            }`}
          >
            <input
              type="radio"
              name="family-variety"
              value={v.id}
              checked={variety === v.id}
              onChange={() => updateFamily((s) => ({ ...s, variety: v.id }))}
              className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-brand)]"
              data-testid={`family-variety-${v.id}`}
            />
            <span className="min-w-0">
              <span className={`block font-extrabold ${variety === v.id ? "text-brand-dark" : "text-ink"}`}>{v.label}</span>
              <span className="block text-sm font-semibold text-pretty text-muted">{v.description}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function TreeView({
  kin,
  people,
  ready,
  variety,
  headingRef,
  onOpen,
  onAdd,
  onQuiz,
}: {
  kin: KinData;
  people: FamilyPerson[];
  ready: boolean;
  variety: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onOpen: (id: string) => void;
  onAdd: (req: AddRequest) => void;
  onQuiz: () => void;
}) {
  const order = relationOrder(kin);
  const known = people.filter((p) => relationById(kin, p.rel));
  const sorted = [...known].sort((a, b) => (order.get(a.rel) ?? 0) - (order.get(b.rel) ?? 0));
  const has = (rel: string) => known.some((p) => p.rel === rel);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-black text-pretty outline-none">
          My family
        </h1>
        <p className="mt-1 font-semibold text-pretty text-muted">
          Add your relatives and learn exactly what to call each one: Bengali has a different word for your mother&apos;s sister and your father&apos;s sister.
        </p>
        <p className="mt-1 text-sm font-semibold text-muted">Names stay on this device.</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" className="btn btn-primary" onClick={() => onAdd({})}>
          Add a relative
        </button>
        <button type="button" className="btn btn-ghost" onClick={onQuiz} disabled={!ready || known.length === 0}>
          Practice my family
        </button>
      </div>

      <VarietyToggle kin={kin} variety={variety} />

      {!ready ? (
        <div className="skeleton h-40" aria-hidden />
      ) : (
        GENS.map(({ gen, title }) => {
          const row = sorted.filter((p) => relationById(kin, p.rel)!.gen === gen);
          if (gen !== 0 && row.length === 0 && !(gen === 1 && known.length === 0)) return null;
          return (
            <section key={gen} aria-labelledby={`family-gen-${gen}`} data-testid={`family-gen-${gen}`}>
              <h2 id={`family-gen-${gen}`} className="mb-2 text-xs font-black tracking-wide text-muted uppercase">
                {title}
              </h2>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {gen === 0 && (
                  <li>
                    <div className="flex h-full min-h-24 flex-col justify-center rounded-3xl border-2 border-dashed border-brand/50 bg-brand-light p-3">
                      <p className="text-lg font-black text-brand-dark">Me</p>
                      <p className="text-xs font-bold text-pretty text-muted">Everyone is named from your point of view.</p>
                    </div>
                  </li>
                )}
                {gen === 1 && known.length === 0 && (
                  <>
                    {!has("mother") && (
                      <li>
                        <StartButton label="Add your mother" onClick={() => onAdd({ group: "parents", preset: { who: "mother" } })} />
                      </li>
                    )}
                    {!has("father") && (
                      <li>
                        <StartButton label="Add your father" onClick={() => onAdd({ group: "parents", preset: { who: "father" } })} />
                      </li>
                    )}
                  </>
                )}
                {row.map((p) => {
                  const r = relationById(kin, p.rel)!;
                  const a = addressOf(p, r, variety);
                  const t = termOf(r, variety);
                  const shown = a.kind === "term" ? { bn: a.term.bn, tr: a.term.tr } : a.kind === "custom" ? { bn: a.text, tr: "" } : t.ref;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => onOpen(p.id)}
                        data-testid="family-person"
                        data-rel={p.rel}
                        className="press flex h-full min-h-24 w-full flex-col items-start rounded-3xl border-2 border-line-strong bg-surface p-3 text-left hover:bg-sunk"
                        style={{ "--lip": "var(--color-line-strong)", "--lip-h": "3px" } as React.CSSProperties}
                      >
                        <span className="text-xs font-bold text-pretty text-muted">{whoLabel({ ...p, name: undefined }, r)}</span>
                        {p.name && <span className="font-black text-pretty text-ink [overflow-wrap:anywhere]">{p.name}</span>}
                        <span lang="bn" className="text-xl font-bold text-ink [overflow-wrap:anywhere]">
                          {shown.bn}
                        </span>
                        {shown.tr && <Translit tr={shown.tr} inButton className="text-sm font-semibold" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

function StartButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full min-h-24 w-full flex-col items-center justify-center gap-1 rounded-3xl border-2 border-dashed border-line-strong bg-surface p-3 text-center font-extrabold text-ink hover:bg-sunk"
    >
      <span aria-hidden className="text-2xl leading-none text-brand-dark">
        +
      </span>
      {label}
    </button>
  );
}
