/** Formality trainer bank: content/formality/scenarios.json (see docs/CONTENT_SCHEMA.md). */

export interface FormalityText {
  bn: string;
  tr: string;
  en: string;
}

export interface FormalityTier {
  id: number;
  title: string;
  description: string;
}

/** One column of the intro card: a pronoun, who gets it, and its matching forms. */
export interface FormalityIntro {
  label: string;
  use: string;
  pronoun: FormalityText;
  forms: FormalityText[];
}

export interface FormalityScenario {
  id: string;
  tier: number;
  situation: string;
  /** Optional frame; `___` marks the gap the options fill. */
  prompt?: FormalityText;
  options: FormalityText[];
  /** Indexes of every acceptable option. */
  answer: number[];
  why: string;
  /** "Both are heard: …" when more than one answer is accepted. */
  varies?: string;
  /** Kolkata / regional note. */
  notes?: string;
}

export interface FormalityBank {
  version: 1;
  roundSize: number;
  unlockScore: number;
  intro: FormalityIntro[];
  tiers: FormalityTier[];
  scenarios: FormalityScenario[];
}

/** One answered question in a round. */
export interface FormalityResult {
  id: string;
  /** Original index of the chosen option. */
  chosen: number;
  correct: boolean;
}

/** Saved under banglalingo.formality.v1. */
export interface FormalityStore {
  v: 1;
  /** Highest tier unlocked (1 = only the first tier). */
  unlocked: number;
  /** Best round score so far, keyed by the newest tier the round included. */
  best: Record<string, number>;
  rounds: number;
}
