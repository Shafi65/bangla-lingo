"use client";

import { useId, useState } from "react";
import { Translit } from "@/components/Translit";
import { relationById, resolvePick, termOf, whoLabel } from "@/lib/family/compose";
import { MAX_NAME, MAX_PEOPLE, newPersonId, updateFamily } from "@/lib/family/storage";
import type { FamilyPerson, KinData } from "@/lib/family/types";
import type { AddRequest } from "./FamilyApp";

/**
 * Guided "Add a relative": pick a kind of relative, answer one question at a time (brother or sister? older
 * or younger than Mum?), then see the Bengali word and optionally give a first name.
 */
export function AddRelative({
  kin,
  variety,
  req,
  people,
  headingRef,
  onCancel,
  onAdded,
}: {
  kin: KinData;
  variety: string;
  req: AddRequest;
  people: FamilyPerson[];
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onCancel: () => void;
  onAdded: (id: string) => void;
}) {
  const uid = useId();
  const [groupId, setGroupId] = useState<string | undefined>(req.group);
  const [answers, setAnswers] = useState<Record<string, string>>(req.preset ?? {});
  const [name, setName] = useState("");
  const [failed, setFailed] = useState(false);
  const group = kin.groups.find((g) => g.id === groupId);
  const nextAsk = group?.asks.find((a) => answers[a.key] === undefined);
  const rel = group && !nextAsk ? resolvePick(kin, group.id, answers) : undefined;
  const from = req.linkedTo ? people.find((p) => p.id === req.linkedTo) : undefined;
  const fromRel = from ? relationById(kin, from.rel) : undefined;

  // Back: undo the last answer the learner gave (presets stay), then leave the group, then cancel.
  const back = () => {
    const given = group?.asks.filter((a) => answers[a.key] !== undefined && req.preset?.[a.key] === undefined) ?? [];
    if (given.length) {
      const { [given[given.length - 1].key]: _drop, ...rest } = answers;
      void _drop;
      setAnswers(rest);
    } else if (group && !req.group) {
      setGroupId(undefined);
      setAnswers({});
    } else onCancel();
  };

  const add = () => {
    if (!rel) return;
    const id = newPersonId();
    const person: FamilyPerson = { id, rel: rel.id };
    const n = name.trim().slice(0, MAX_NAME);
    if (n) person.name = n;
    if (from) person.linkedTo = from.id;
    let ok = true;
    updateFamily((s) => {
      if (s.people.length >= MAX_PEOPLE) {
        ok = false;
        return s;
      }
      return { ...s, people: [...s.people, person] };
    });
    if (ok) onAdded(id);
    else setFailed(true);
  };

  const title = rel ? "Add this relative" : group ? group.title : "Add a relative";

  return (
    <div className="flex flex-col gap-5" data-testid="family-add">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={back}>
          Back
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div>
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-black text-pretty outline-none">
          {title}
        </h1>
        {from && fromRel && <p className="mt-1 font-semibold text-muted">Related to {whoLabel(from, fromRel)}</p>}
      </div>

      {!group && (
        <ul className="grid gap-2" aria-label="Kinds of relative">
          {kin.groups.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                className="choice"
                data-group={g.id}
                onClick={() => {
                  setGroupId(g.id);
                  setAnswers({});
                }}
              >
                <span className="flex min-w-0 flex-col leading-tight">
                  <span>{g.title}</span>
                  <span className="text-sm font-semibold text-muted">{g.hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {group && nextAsk && (
        <div role="group" aria-labelledby={`${uid}-q`} className="flex flex-col gap-3">
          <p id={`${uid}-q`} className="text-xl font-black text-pretty">
            {nextAsk.q}
          </p>
          {nextAsk.options.map((o) => (
            <button
              key={o.v}
              type="button"
              className="choice"
              data-answer={o.v}
              onClick={() => setAnswers({ ...answers, [nextAsk.key]: o.v })}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {rel && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <div className="card p-4" data-testid="family-add-preview">
            <p className="text-xs font-black tracking-wide text-muted uppercase">Your {rel.label}</p>
            <p lang="bn" className="mt-1 text-3xl font-bold">
              {termOf(rel, variety).ref.bn}
            </p>
            <Translit tr={termOf(rel, variety).ref.tr} className="text-sm font-semibold" />
            <p className="mt-2 text-sm font-semibold text-pretty text-ink">{rel.explain}</p>
          </div>
          <label className="flex flex-col gap-1">
            <span className="font-extrabold">First name (optional)</span>
            <span className="text-sm font-semibold text-muted">Only saved on this device. It makes practice more personal.</span>
            <input
              type="text"
              value={name}
              maxLength={MAX_NAME}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
              className="focus-border min-h-12 rounded-2xl border-2 border-line-strong bg-surface px-4 text-lg font-bold text-ink focus:border-brand"
            />
          </label>
          {failed && (
            <p role="alert" className="font-bold text-accent-dark">
              Couldn&apos;t save. Your browser may be blocking storage, or the tree is full.
            </p>
          )}
          <button type="submit" className="btn btn-primary">
            Add to my family
          </button>
        </form>
      )}
    </div>
  );
}
