// Shapes shared by the Translate page's server data, search and UI. Pure; safe anywhere.

/** One searchable course item. Optional fields are omitted when empty. */
export interface TItem {
  bn: string;
  tr: string;
  en: string;
  /** Other English glosses / accepted translations. */
  alt?: string[];
  pos?: string;
  /** Kolkata variant: Bengali and transliteration. */
  kb?: string;
  kt?: string;
  /** Usage note. */
  n?: string;
  /** Lesson id that teaches it (key into TranslateData.lessons). */
  l?: string;
  /** 1 = an example sentence from a lesson plan. */
  s?: 1;
  /** 1 = an assumed-known word (used by intermediate lessons, not taught). */
  a?: 1;
}

export interface TranslateData {
  units: { id: string; title: string }[];
  /** lesson id -> title and index into `units` */
  lessons: Record<string, { t: string; u: number }>;
  items: TItem[];
}

export type Lang = "en" | "bn";

/** What the machine-translation route answers (see lib/translate/machine.ts). */
export type MachineResponse =
  | {
      ok: true;
      text: string;
      from: Lang;
      to: Lang;
      /** Romanized input: the Bengali script it was read as. */
      read?: string;
      /** Bengali output: an approximate romanization, one entry per whitespace-separated word of `text`. */
      roman?: string[];
    }
  | { ok: false; configured: false }
  | { ok: false; quota: true; error: string }
  | { ok: false; error: string };

/** What GET /translate/api?health=1 answers. Nothing else, ever. */
export interface HealthResponse {
  configured: boolean;
}

export const QUOTA_MESSAGE = "The free translation allowance is used up for this month; course words still work.";
export const BUSY_MESSAGE = "Translation is busy, try again in a minute. Course words still work.";
