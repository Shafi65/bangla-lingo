// Builds what a person's card shows: terms, pronoun, phrases. Pure; mirrors the composition rules in
// content/scripts/validate-family.mjs (familyAudioStrings), so every default phrase has a clip there.
import type {
  FamilyPerson,
  FamilyStore,
  KinData,
  KinRelation,
  KinTemplate,
  KinTerm,
  KinText,
  PronounId,
  PronounSpec,
} from "./types";

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Removes the "{slot}, " / ", {slot}" part of a template. */
export function stripSlot(s: string, slot: string): string {
  return s.replace(new RegExp(`^\\{${slot}\\},\\s*`), "").replace(new RegExp(`,\\s*\\{${slot}\\}`), "");
}

export function fillAddr(t: Pick<KinTemplate, "bn" | "tr" | "en">, addr: Pick<KinText, "bn" | "tr"> | null) {
  if (!addr) return { bn: stripSlot(t.bn, "addr"), tr: stripSlot(t.tr, "addr"), en: cap(stripSlot(t.en, "addr")) };
  return { bn: t.bn.replace("{addr}", addr.bn), tr: t.tr.replace("{addr}", addr.tr), en: t.en.replace("{addr}", cap(addr.tr)) };
}

export function findTemplate(kin: KinData, kind: string, variety: string, pronoun: PronounId): KinTemplate | undefined {
  return kin.phrases.find(
    (p) => p.kind === kind && (!p.variety || p.variety === variety) && (!p.pronouns || p.pronouns.includes(pronoun)),
  );
}

export function varietyOf(kin: KinData, store: Pick<FamilyStore, "variety">): string {
  return store.variety && kin.varieties.some((v) => v.id === store.variety) ? store.variety : kin.defaultVariety;
}

export const relationById = (kin: KinData, id: string) => kin.relations.find((r) => r.id === id);
export const termOf = (r: KinRelation, variety: string): KinTerm => r.terms[variety] ?? Object.values(r.terms)[0];
export const pronounSpecOf = (r: KinRelation, variety: string): PronounSpec => termOf(r, variety).pronoun ?? r.pronoun;

export function pronounOf(p: FamilyPerson, r: KinRelation, variety: string): PronounId {
  return p.pronoun ?? pronounSpecOf(r, variety).default;
}

export type Address = { kind: "term"; term: Pick<KinText, "bn" | "tr"> } | { kind: "name" } | { kind: "custom"; text: string };

export function addressOf(p: FamilyPerson, r: KinRelation, variety: string): Address {
  const c = p.call;
  if (c?.type === "term") return { kind: "term", term: { bn: c.bn, tr: c.tr } };
  if (c?.type === "name") return { kind: "name" };
  if (c?.type === "custom" && c.text.trim()) return { kind: "custom", text: c.text.trim() };
  const first = termOf(r, variety).addr[0];
  return first ? { kind: "term", term: first } : { kind: "name" };
}

/** Every address choice offered for "We call them ___": this variety's terms first, then the other's. */
export function addressChoices(kin: KinData, r: KinRelation, variety: string): Pick<KinText, "bn" | "tr">[] {
  const out: Pick<KinText, "bn" | "tr">[] = [];
  const seen = new Set<string>();
  const order = [variety, ...kin.varieties.map((v) => v.id).filter((v) => v !== variety)];
  for (const v of order) {
    const t = r.terms[v];
    if (!t) continue;
    for (const a of t.addr) {
      if (seen.has(a.bn)) continue;
      seen.add(a.bn);
      out.push({ bn: a.bn, tr: a.tr });
    }
  }
  return out;
}

export interface ComposedPhrase {
  kind: string;
  label: string;
  bn: string;
  tr: string;
  en: string;
  note?: string;
  /** What the play button speaks (the bare phrase when the address is a name or a custom word). */
  audio: string;
}

export function phrasesFor(kin: KinData, p: FamilyPerson, r: KinRelation, variety: string): ComposedPhrase[] {
  const pronoun = pronounOf(p, r, variety);
  const addr = addressOf(p, r, variety);
  const out: ComposedPhrase[] = [];
  for (const kind of r.phrases) {
    const t = findTemplate(kin, kind, variety, pronoun);
    if (!t) continue;
    const label = kin.kinds.find((k) => k.id === kind)?.label ?? kind;
    const bare = fillAddr(t, null);
    if (addr.kind === "term") {
      const f = fillAddr(t, addr.term);
      out.push({ kind, label, ...f, note: t.note, audio: f.bn });
    } else if (addr.kind === "custom") {
      out.push({
        kind,
        label,
        bn: t.bn.replace("{addr}", addr.text),
        tr: t.tr.replace("{addr}", addr.text),
        en: t.en.replace("{addr}", addr.text),
        note: t.note,
        audio: bare.bn,
      });
    } else {
      const name = p.name?.trim();
      out.push({ kind, label, ...bare, en: name ? t.en.replace("{addr}", name) : bare.en, note: t.note, audio: bare.bn });
    }
  }
  return out;
}

/** "উনি আমার খালা।" — talking about them. */
export function introFor(kin: KinData, p: FamilyPerson, r: KinRelation, variety: string) {
  const t = findTemplate(kin, "intro", variety, pronounOf(p, r, variety));
  const ref = termOf(r, variety).ref;
  if (!t) return null;
  return { bn: t.bn.replace("{ref}", ref.bn), tr: t.tr.replace("{ref}", ref.tr), en: t.en.replace("{label}", r.label) };
}

/** "Rina (Mum's younger sister)" or "Mum's younger sister". */
export function whoLabel(p: FamilyPerson, r: KinRelation): string {
  const name = p.name?.trim();
  return name ? `${name} (${r.short})` : cap(r.short);
}

/** Sort key: group order, then relation order in the data. */
export function relationOrder(kin: KinData): Map<string, number> {
  const g = new Map(kin.groups.map((x, i) => [x.id, i]));
  return new Map(kin.relations.map((r, i) => [r.id, (g.get(r.group) ?? 99) * 1000 + i]));
}

/** The relation a group's answers lead to (undefined until every question is answered). */
export function resolvePick(kin: KinData, groupId: string, answers: Record<string, string>): KinRelation | undefined {
  const g = kin.groups.find((x) => x.id === groupId);
  if (!g || !g.asks.every((a) => answers[a.key] !== undefined)) return undefined;
  return kin.relations.find((r) => r.group === groupId && g.asks.every((a) => r.pick[a.key] === answers[a.key]));
}
