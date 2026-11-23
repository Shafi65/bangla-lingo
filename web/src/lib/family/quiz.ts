// "Practice my family": questions about the learner's own relatives. Pure, deterministic for a given rand.
import { addressChoices, addressOf, pronounOf, pronounSpecOf, relationById, termOf, varietyOf, whoLabel } from "./compose";
import type { FamilyStore, KinData, PronounId } from "./types";

export interface QuizOption {
  /** Bengali (or the learner's own word). */
  bn: string;
  tr?: string;
}

export interface QuizQuestion {
  personId: string;
  type: "addr" | "ref" | "pronoun";
  prompt: string;
  /** Shown under the prompt, e.g. the sentence frame. */
  hint?: string;
  options: QuizOption[];
  /** Indexes into options that count as right. */
  answer: number[];
  why: string;
}

export const ROUND_SIZE = 10;

export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: readonly T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Three wrong kin terms: the learner's other relatives first, then near relations (same generation and gender). */
function distractors(
  kin: KinData,
  store: FamilyStore,
  variety: string,
  relId: string,
  exclude: Set<string>,
  kind: "addr" | "ref",
  rand: () => number,
): QuizOption[] {
  const self = relationById(kin, relId)!;
  const pick = (ids: string[]) =>
    shuffle(ids, rand).flatMap((id) => {
      const r = relationById(kin, id);
      if (!r) return [];
      const t = termOf(r, variety);
      return kind === "ref" ? [t.ref] : t.addr.length ? [t.addr[0]] : [t.ref];
    });
  const mine = store.people.map((p) => p.rel).filter((id) => id !== relId);
  const near = kin.relations.filter((r) => r.id !== relId && r.gen === self.gen && r.gender === self.gender).map((r) => r.id);
  const rest = kin.relations.filter((r) => r.id !== relId).map((r) => r.id);
  const out: QuizOption[] = [];
  const seen = new Set(exclude);
  for (const t of [...pick(mine), ...pick(near), ...pick(rest)]) {
    if (out.length >= 3) break;
    if (seen.has(t.bn)) continue;
    seen.add(t.bn);
    out.push({ bn: t.bn, tr: t.tr });
  }
  return out;
}

/**
 * A round of up to ROUND_SIZE questions. Each person gets a "what do you call them" question (or "how do you
 * talk about them" when they are called by name) before anyone gets a second; then pronoun questions, then the rest.
 */
export function buildQuiz(kin: KinData, store: FamilyStore, rand: () => number, size = ROUND_SIZE): QuizQuestion[] {
  const variety = varietyOf(kin, store);
  const people = shuffle(
    store.people.filter((p) => relationById(kin, p.rel)),
    rand,
  );
  const tiers: QuizQuestion[][] = [[], [], []];
  for (const p of people) {
    const r = relationById(kin, p.rel)!;
    const who = whoLabel(p, r);
    const term = termOf(r, variety);
    const addr = addressOf(p, r, variety);
    const refQ = (): QuizQuestion => {
      const exclude = new Set([term.ref.bn]);
      const opts = shuffle([{ bn: term.ref.bn, tr: term.ref.tr }, ...distractors(kin, store, variety, r.id, exclude, "ref", rand)], rand);
      return {
        personId: p.id,
        type: "ref",
        prompt: `Talking about ${who}, you say: "This is my ___."`,
        options: opts,
        answer: [opts.findIndex((o) => o.bn === term.ref.bn)],
        why: `Your ${r.label} is your ${term.ref.bn} (${term.ref.tr}).`,
      };
    };
    let first: QuizQuestion | null = null;
    if (addr.kind !== "name") {
      const right: QuizOption = addr.kind === "term" ? { bn: addr.term.bn, tr: addr.term.tr } : { bn: addr.text };
      // Other listed address words are not wrong, so they never appear as distractors.
      const exclude = new Set([right.bn, ...addressChoices(kin, r, variety).map((a) => a.bn), term.ref.bn]);
      const opts = shuffle([right, ...distractors(kin, store, variety, r.id, exclude, "addr", rand)], rand);
      first = {
        personId: p.id,
        type: "addr",
        prompt: `What do you call ${who}?`,
        options: opts,
        answer: [opts.findIndex((o) => o.bn === right.bn)],
        why: p.call ? `Your family calls ${p.name?.trim() || "them"} ${right.bn}.` : `Your ${r.label} → ${right.bn}${right.tr ? ` (${right.tr})` : ""}.`,
      };
      tiers[2].push(refQ());
    } else {
      first = refQ();
    }
    tiers[0].push(first);
    const spec = pronounSpecOf(r, variety);
    const accepted: PronounId[] = p.pronoun ? [p.pronoun] : [spec.default, ...spec.also];
    const opts = kin.pronouns.map((x) => ({ bn: x.bn, tr: x.tr }));
    tiers[1].push({
      personId: p.id,
      type: "pronoun",
      prompt: `Which "you" do you use with ${who}?`,
      options: opts,
      answer: kin.pronouns.flatMap((x, i) => (accepted.includes(x.id) ? [i] : [])),
      why: p.pronoun
        ? `You chose ${kin.pronouns.find((x) => x.id === pronounOf(p, r, variety))?.bn} for ${p.name?.trim() || "them"}.`
        : spec.note ?? `${kin.pronouns.find((x) => x.id === spec.default)?.bn} is usual with your ${r.label}.`,
    });
  }
  return [...tiers[0], ...tiers[1], ...tiers[2]].slice(0, size);
}
