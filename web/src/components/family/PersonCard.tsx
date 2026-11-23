"use client";

import { useId, useState } from "react";
import { SpeakButton } from "@/components/SpeakButton";
import { Translit } from "@/components/Translit";
import {
  addressChoices,
  addressOf,
  introFor,
  phrasesFor,
  pronounOf,
  pronounSpecOf,
  relationById,
  termOf,
  whoLabel,
} from "@/lib/family/compose";
import { MAX_NAME, removePerson, updateFamily } from "@/lib/family/storage";
import type { CallOverride, FamilyPerson, KinData, PronounId } from "@/lib/family/types";
import type { AddRequest } from "./FamilyApp";

const sameCall = (a: CallOverride | undefined, b: CallOverride | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** One relative: the words, the pronoun, phrases to say, a "why" line, and the family's own choices. */
export function PersonCard({
  kin,
  person,
  people,
  variety,
  headingRef,
  onBack,
  onAdd,
  onOpen,
}: {
  kin: KinData;
  person: FamilyPerson;
  people: FamilyPerson[];
  variety: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  onAdd: (req: AddRequest) => void;
  onOpen: (id: string) => void;
}) {
  const uid = useId();
  const r = relationById(kin, person.rel);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [custom, setCustom] = useState(person.call?.type === "custom" ? person.call.text : "");
  if (!r) return null;
  const term = termOf(r, variety);
  const spec = pronounSpecOf(r, variety);
  const pronoun = pronounOf(person, r, variety);
  const pr = kin.pronouns.find((p) => p.id === pronoun)!;
  const addr = addressOf(person, r, variety);
  const intro = introFor(kin, person, r, variety);
  const phrases = phrasesFor(kin, person, r, variety);
  const choices = addressChoices(kin, r, variety);
  const her = r.gender === "f" ? "her" : "him";
  const linked = person.linkedTo ? people.find((p) => p.id === person.linkedTo) : undefined;
  const linkedRel = linked ? relationById(kin, linked.rel) : undefined;
  const kids = people.filter((p) => p.linkedTo === person.id && relationById(kin, p.rel));

  const set = (patch: Partial<FamilyPerson>) =>
    updateFamily((s) => ({
      ...s,
      people: s.people.map((p) => {
        if (p.id !== person.id) return p;
        const next = { ...p, ...patch };
        for (const k of Object.keys(patch) as (keyof FamilyPerson)[]) if (patch[k] === undefined) delete next[k];
        return next;
      }),
    }));

  const shownAddr =
    addr.kind === "term" ? (
      <>
        <span lang="bn" className="text-3xl font-bold">
          {addr.term.bn}
        </span>
        <Translit tr={addr.term.tr} className="text-sm font-semibold" />
      </>
    ) : addr.kind === "custom" ? (
      <span className="text-2xl font-bold [overflow-wrap:anywhere]">{addr.text}</span>
    ) : (
      <span className="text-lg font-bold">By {person.name ? person.name : `${r.gender === "f" ? "her" : "his"} name`}</span>
    );

  return (
    <article className="flex flex-col gap-5" data-testid="family-card" data-rel={r.id}>
      <div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          Back to my family
        </button>
      </div>
      <div>
        <p className="text-xs font-black tracking-wide text-muted uppercase">{whoLabel({ ...person, name: undefined }, r)}</p>
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-black text-pretty outline-none [overflow-wrap:anywhere]">
          {person.name || whoLabel(person, r)}
        </h1>
        {linked && linkedRel && (
          <p className="mt-1 text-sm font-semibold text-muted">
            Added from{" "}
            <button type="button" className="min-h-11 font-extrabold text-brand-dark underline" onClick={() => onOpen(linked.id)}>
              {whoLabel(linked, linkedRel)}
            </button>
          </p>
        )}
      </div>

      <p className="rounded-3xl border-2 border-sun/50 bg-sun-light p-4 font-semibold text-pretty text-ink" data-testid="family-why">
        <span className="font-black">Why: </span>
        your {r.label} → <span lang="bn" className="font-bold">{term.ref.bn}</span>. {r.explain}
        {term.note && <span className="mt-1 block text-sm">{term.note}</span>}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="card p-4" aria-labelledby={`${uid}-call`}>
          <h2 id={`${uid}-call`} className="text-xs font-black tracking-wide text-muted uppercase">
            Calling {her}
          </h2>
          <div className="mt-1 flex items-center gap-3">
            {addr.kind === "term" && <SpeakButton bn={addr.term.bn} />}
            <div className="flex min-w-0 flex-col" data-testid="family-addr">
              {shownAddr}
            </div>
          </div>
        </section>
        <section className="card p-4" aria-labelledby={`${uid}-ref`}>
          <h2 id={`${uid}-ref`} className="text-xs font-black tracking-wide text-muted uppercase">
            Talking about {her}
          </h2>
          <div className="mt-1 flex items-center gap-3">
            <SpeakButton bn={term.ref.bn} />
            <div className="flex min-w-0 flex-col" data-testid="family-ref">
              <span lang="bn" className="text-3xl font-bold">
                {term.ref.bn}
              </span>
              <Translit tr={term.ref.tr} className="text-sm font-semibold" />
            </div>
          </div>
          {intro && (
            <div className="mt-3 flex items-center gap-3 border-t-2 border-line pt-3">
              <SpeakButton bn={intro.bn} size="sm" />
              <div className="min-w-0">
                <p lang="bn" className="text-lg font-bold">
                  {intro.bn}
                </p>
                <Translit tr={intro.tr} className="text-sm font-semibold" />
                <p className="text-sm font-semibold text-muted">{intro.en}</p>
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="card p-4" aria-labelledby={`${uid}-you`}>
        <h2 id={`${uid}-you`} className="text-xs font-black tracking-wide text-muted uppercase">
          Which &ldquo;you&rdquo;
        </h2>
        <div className="mt-1 flex items-center gap-3" data-testid="family-pronoun" data-pronoun={pronoun}>
          <span lang="bn" className="text-3xl font-bold">
            {pr.bn}
          </span>
          <span className="flex flex-col">
            <Translit tr={pr.tr} className="text-sm font-semibold" />
            <span className="text-sm font-semibold text-muted">{pr.en}</span>
          </span>
        </div>
        {spec.note && !person.pronoun && <p className="mt-2 text-sm font-semibold text-pretty text-ink">{spec.note}</p>}
      </section>

      <section aria-labelledby={`${uid}-say`}>
        <h2 id={`${uid}-say`} className="mb-2 text-lg font-black">
          Things to say
        </h2>
        <ul className="flex flex-col gap-2">
          {phrases.map((ph) => (
            <li key={ph.kind} className="card flex items-center gap-3 p-3" data-testid="family-phrase" data-kind={ph.kind}>
              <SpeakButton bn={ph.audio} />
              <div className="min-w-0">
                <p className="text-xs font-black tracking-wide text-muted uppercase">{ph.label}</p>
                <p lang="bn" className="text-xl font-bold text-pretty [overflow-wrap:anywhere]">
                  {ph.bn}
                </p>
                <Translit tr={ph.tr} className="text-sm font-semibold" />
                <p className="text-sm font-semibold text-pretty text-ink">{ph.en}</p>
                {ph.note && <p className="text-xs font-semibold text-pretty text-muted">{ph.note}</p>}
              </div>
            </li>
          ))}
        </ul>
        {addr.kind !== "term" && (
          <p className="mt-2 text-sm font-semibold text-muted">Add {her} name when you speak; the recording leaves it out.</p>
        )}
      </section>

      <section className="card flex flex-col gap-4 p-4" aria-labelledby={`${uid}-ours`}>
        <h2 id={`${uid}-ours`} className="text-lg font-black">
          In our family
        </h2>

        <label className="flex flex-col gap-1">
          <span className="font-extrabold">First name</span>
          <input
            type="text"
            defaultValue={person.name ?? ""}
            maxLength={MAX_NAME}
            autoComplete="off"
            onBlur={(e) => set({ name: e.target.value.trim() || undefined })}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className="focus-border min-h-12 rounded-2xl border-2 border-line-strong bg-surface px-4 text-lg font-bold text-ink focus:border-brand"
            data-testid="family-name"
          />
        </label>

        <fieldset>
          <legend className="font-extrabold">We call {her}…</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {choices.map((c, i) => {
              const call: CallOverride | undefined = i === 0 && term.addr[0]?.bn === c.bn ? undefined : { type: "term", bn: c.bn, tr: c.tr };
              const on = addr.kind === "term" && addr.term.bn === c.bn;
              return (
                <button
                  key={c.bn}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ call })}
                  className={`min-h-11 rounded-2xl border-2 px-3 py-1 text-left ${on ? "border-brand bg-brand-light text-brand-dark" : "border-line-strong bg-surface hover:bg-sunk"}`}
                >
                  <span lang="bn" className="text-lg font-bold">
                    {c.bn}
                  </span>{" "}
                  <Translit tr={c.tr} inButton className="text-sm font-semibold" />
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={addr.kind === "name"}
              onClick={() => set({ call: term.addr.length ? { type: "name" } : undefined })}
              className={`min-h-11 rounded-2xl border-2 px-3 py-1 font-bold ${addr.kind === "name" ? "border-brand bg-brand-light text-brand-dark" : "border-line-strong bg-surface hover:bg-sunk"}`}
            >
              {r.gender === "f" ? "Her" : "His"} name
            </button>
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const text = custom.trim().slice(0, MAX_NAME);
              if (text) set({ call: { type: "custom", text } });
            }}
          >
            <label className="flex min-w-0 flex-1 flex-col">
              <span className="sr-only">Our own word</span>
              <input
                type="text"
                value={custom}
                maxLength={MAX_NAME}
                placeholder="Our own word"
                autoComplete="off"
                onChange={(e) => setCustom(e.target.value)}
                className="focus-border min-h-11 w-full rounded-2xl border-2 border-line-strong bg-surface px-3 font-bold text-ink focus:border-brand"
                data-testid="family-custom"
              />
            </label>
            <button type="submit" className="btn btn-ghost btn-sm" disabled={!custom.trim()}>
              Use
            </button>
          </form>
          {person.call && !sameCall(person.call, undefined) && (
            <button
              type="button"
              className="mt-2 min-h-11 text-sm font-extrabold text-brand-dark underline"
              onClick={() => {
                setCustom("");
                set({ call: undefined });
              }}
            >
              Use the usual word again
            </button>
          )}
        </fieldset>

        <fieldset>
          <legend className="font-extrabold">With {her} we say…</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {kin.pronouns.map((p) => {
              const on = pronoun === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  data-pronoun={p.id}
                  onClick={() => set({ pronoun: p.id === spec.default ? undefined : (p.id as PronounId) })}
                  className={`flex min-h-12 flex-col items-center justify-center rounded-2xl border-2 px-2 py-1 ${on ? "border-brand bg-brand-light text-brand-dark" : "border-line-strong bg-surface hover:bg-sunk"}`}
                >
                  <span lang="bn" className="text-lg font-bold">
                    {p.bn}
                  </span>
                  <span className="text-xs font-semibold">{p.id === spec.default ? "usual" : spec.also.includes(p.id) ? "also heard" : p.en}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      </section>

      {(r.actions?.length ?? 0) > 0 && (
        <section aria-labelledby={`${uid}-more`}>
          <h2 id={`${uid}-more`} className="mb-2 text-lg font-black">
            Add family through {person.name || her}
          </h2>
          <div className="flex flex-col gap-2">
            {r.actions!.map((a) => (
              <button key={a.label} type="button" className="btn btn-ghost" onClick={() => onAdd({ group: a.group, preset: a.preset, linkedTo: person.id })}>
                {a.label}
              </button>
            ))}
          </div>
          {kids.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Added from here">
              {kids.map((k) => (
                <li key={k.id}>
                  <button type="button" className="chip min-h-11 bg-brand-light px-3 text-sm text-brand-dark" onClick={() => onOpen(k.id)}>
                    {whoLabel(k, relationById(kin, k.rel)!)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="border-t-2 border-line pt-4">
        {!confirmRemove ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmRemove(true)}>
            Remove from my family
          </button>
        ) : (
          <div role="alertdialog" aria-labelledby={`${uid}-rm`} className="flex flex-col gap-2">
            <p id={`${uid}-rm`} className="font-bold">
              Remove {person.name || whoLabel(person, r)}?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => {
                  updateFamily((s) => removePerson(s, person.id));
                  onBack();
                }}
              >
                Remove
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmRemove(false)} autoFocus>
                Keep
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
