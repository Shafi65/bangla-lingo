// Bazaar mini-game data (content/bazaar/stalls.json, checked by content/scripts/validate-bazaar.mjs).
export interface BnLine {
  bn: string;
  tr: string;
  en: string;
}

export interface ChooseStep {
  kind: "choose";
  prompt: string;
  /** A line the seller says first (optional). */
  say?: BnLine;
  options: BnLine[];
  answer: number;
  why: string;
  /** What the seller says back after a right answer. */
  reply?: BnLine;
  /** The price after a right answer. */
  price?: number;
  /** A right answer here talks the price down (counts as savings). */
  haggle?: true;
}

export interface ListenStep {
  kind: "listen";
  prompt: string;
  say: BnLine;
  choices: string[];
  answer: number;
  why: string;
}

export type BazaarStep = ChooseStep | ListenStep;

export interface Stall {
  id: string;
  title: string;
  item: string;
  intro: string;
  start: number;
  unit: string;
  steps: BazaarStep[];
}

export interface BazaarBank {
  version: 1;
  coinsPerStep: number;
  haggleBonus: number;
  stalls: Stall[];
}
