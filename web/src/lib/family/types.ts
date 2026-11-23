// "My family" data (content/family/kin.json, see docs/CONTENT_SCHEMA.md) and the learner's own tree
// (localStorage banglalingo.family.v1). Pure types, safe on server and client.

export type PronounId = "apni" | "tumi" | "tui";
export const PRONOUN_IDS: readonly PronounId[] = ["apni", "tumi", "tui"];

export interface KinText {
  bn: string;
  tr: string;
  en: string;
}

export interface PronounSpec {
  default: PronounId;
  also: PronounId[];
  note?: string;
}

export interface KinTerm {
  /** Talking about them ("my …"). */
  ref: KinText;
  /** Calling them; the first is the usual one. Empty = called by name. */
  addr: KinText[];
  note?: string;
  /** Overrides the relation's pronoun in this variety. */
  pronoun?: PronounSpec;
}

export interface KinAction {
  label: string;
  group: string;
  preset?: Record<string, string>;
}

export interface KinRelation {
  id: string;
  group: string;
  /** 2 grandparents, 1 parents' generation, 0 yours, -1 children's. */
  gen: number;
  gender: "m" | "f";
  pick: Record<string, string>;
  /** Lower-case English, e.g. "mother's younger sister". */
  label: string;
  /** For prompts, e.g. "Mum's younger sister". */
  short: string;
  explain: string;
  pronoun: PronounSpec;
  /** Phrase kinds shown on the card. */
  phrases: string[];
  terms: Record<string, KinTerm>;
  actions?: KinAction[];
}

export interface KinAsk {
  key: string;
  q: string;
  options: { v: string; label: string }[];
}

export interface KinGroup {
  id: string;
  title: string;
  hint: string;
  asks: KinAsk[];
}

export interface KinTemplate {
  id: string;
  kind: string;
  variety?: string;
  pronouns?: PronounId[];
  bn: string;
  tr: string;
  en: string;
  note?: string;
}

export interface KinData {
  version: 1;
  defaultVariety: string;
  varieties: { id: string; label: string; description: string }[];
  pronouns: (KinText & { id: PronounId; use: string })[];
  kinds: { id: string; label: string }[];
  phrases: KinTemplate[];
  groups: KinGroup[];
  relations: KinRelation[];
}

/** "We call her ___": a listed term, her name, or the learner's own word. */
export type CallOverride = { type: "term"; bn: string; tr: string } | { type: "name" } | { type: "custom"; text: string };

export interface FamilyPerson {
  id: string;
  rel: string;
  name?: string;
  call?: CallOverride;
  pronoun?: PronounId;
  /** The person this one was added from (e.g. a cousin's parent). */
  linkedTo?: string;
}

export interface FamilyStore {
  v: 1;
  /** Chosen family variety; unset = the data's default. */
  variety?: string;
  people: FamilyPerson[];
  quiz: { rounds: number; best: number };
}
