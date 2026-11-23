// The learner's family tree, on this device only: localStorage banglalingo.family.v1. Names never leave
// the device (not synced, not sent anywhere). Every access is wrapped in try/catch.
import { useMemo, useSyncExternalStore } from "react";
import { PRONOUN_IDS, type CallOverride, type FamilyPerson, type FamilyStore, type PronounId } from "./types";

export const FAMILY_KEY = "banglalingo.family.v1";
export const MAX_PEOPLE = 200;
export const MAX_NAME = 40;

export const emptyFamily = (): FamilyStore => ({ v: 1, people: [], quiz: { rounds: 0, best: 0 } });

const str = (x: unknown, max: number) => (typeof x === "string" && x.trim() ? x.trim().slice(0, max) : undefined);
const ID = /^[a-z0-9-]{1,40}$/;

function parseCall(x: unknown): CallOverride | undefined {
  if (!x || typeof x !== "object") return undefined;
  const c = x as Record<string, unknown>;
  if (c.type === "name") return { type: "name" };
  if (c.type === "term" && typeof c.bn === "string" && c.bn && typeof c.tr === "string") return { type: "term", bn: c.bn, tr: c.tr };
  const text = str(c.text, MAX_NAME);
  if (c.type === "custom" && text) return { type: "custom", text };
  return undefined;
}

/** Tolerant parse: unknown fields are dropped, anything unreadable gives an empty tree. */
export function parseFamily(raw: string | null | undefined): FamilyStore {
  if (!raw) return emptyFamily();
  try {
    const x = JSON.parse(raw) as Record<string, unknown> | null;
    if (!x || typeof x !== "object" || x.v !== 1) return emptyFamily();
    const people: FamilyPerson[] = [];
    const ids = new Set<string>();
    for (const p of Array.isArray(x.people) ? x.people.slice(0, MAX_PEOPLE) : []) {
      if (!p || typeof p !== "object") continue;
      const o = p as Record<string, unknown>;
      if (typeof o.id !== "string" || !ID.test(o.id) || ids.has(o.id) || typeof o.rel !== "string" || !o.rel) continue;
      ids.add(o.id);
      const person: FamilyPerson = { id: o.id, rel: o.rel };
      const name = str(o.name, MAX_NAME);
      if (name) person.name = name;
      const call = parseCall(o.call);
      if (call) person.call = call;
      if (PRONOUN_IDS.includes(o.pronoun as PronounId)) person.pronoun = o.pronoun as PronounId;
      if (typeof o.linkedTo === "string" && ID.test(o.linkedTo)) person.linkedTo = o.linkedTo;
      people.push(person);
    }
    for (const p of people) if (p.linkedTo && !ids.has(p.linkedTo)) delete p.linkedTo;
    const q = (x.quiz ?? {}) as Record<string, unknown>;
    const n = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : 0);
    const store: FamilyStore = { v: 1, people, quiz: { rounds: n(q.rounds), best: n(q.best) } };
    const variety = str(x.variety, 20);
    if (variety) store.variety = variety;
    return store;
  } catch {
    return emptyFamily();
  }
}

const listeners = new Set<() => void>();

export function subscribeFamily(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === FAMILY_KEY || e.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function readFamilyRaw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(FAMILY_KEY);
  } catch {
    return null;
  }
}

export function readFamily(): FamilyStore {
  return parseFamily(readFamilyRaw());
}

export function writeFamily(store: FamilyStore): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(FAMILY_KEY, JSON.stringify(store));
    listeners.forEach((l) => l());
    return true;
  } catch {
    return false;
  }
}

/** Reads, changes and writes the stored tree in one go. */
export function updateFamily(fn: (s: FamilyStore) => FamilyStore): FamilyStore {
  const next = fn(readFamily());
  writeFamily(next);
  return next;
}

export function newPersonId(): string {
  return `p-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function removePerson(s: FamilyStore, id: string): FamilyStore {
  return {
    ...s,
    people: s.people.filter((p) => p.id !== id).map((p) => (p.linkedTo === id ? { ...p, linkedTo: undefined } : p)),
  };
}

/** Reactive store; empty on the server and the first render (`ready` false until read). */
export function useFamilyStore(): { store: FamilyStore; ready: boolean } {
  const raw = useSyncExternalStore(subscribeFamily, readFamilyRaw, () => undefined);
  return useMemo(() => ({ store: parseFamily(raw ?? null), ready: raw !== undefined }), [raw]);
}
