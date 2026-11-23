// Shapes for graded stories (content/stories/*.json, see docs/CONTENT_SCHEMA.md "Stories"). Pure; safe anywhere.

export interface StoryBnText {
  bn: string;
  tr: string;
  en: string;
}

/** One meaning of a tappable word, from content/lexicon/. */
export interface Gloss {
  /** Lexicon id. */
  id: string;
  /** Lexicon spelling (what the play button says). */
  bn: string;
  tr: string;
  en: string;
  alt?: string[];
  pos?: string;
  notes?: string;
  /** Set when the word was found through an ending: "ভাতটা → ভাত + -টা 'the'". */
  via?: string;
}

/** A word (or multi-word lexicon phrase) of a line, with what surrounds it. */
export interface StoryWord {
  /** Punctuation before the word ("“"). */
  pre: string;
  /** The word as written (may hold inner punctuation when a phrase spans it). */
  text: string;
  /** Punctuation after the word ("।", "?", ","). */
  post: string;
  /** Meanings: one when the word is unambiguous or pinned by `senses`; none when unknown. */
  glosses: Gloss[];
}

export interface StoryLine extends StoryBnText {
  speaker?: string;
  words: StoryWord[];
}

export interface StoryOption {
  /** English text, or the Bengali for a Bengali option. */
  text: string;
  /** Bengali options only. */
  bn?: StoryBnText;
}

export interface StoryQuestion {
  /** Shown after this line (0-based). */
  after: number;
  question: string;
  questionBn?: StoryBnText;
  options: StoryOption[];
  /** Index into `options` as authored (the player shuffles the display order). */
  answer: number;
  why: string;
}

export interface Story {
  id: string;
  unit: string;
  unitTitle: string;
  /** 1-based number of the unit among main-track units (for "Unit 3"). */
  unitNumber: number;
  /** Completing this lesson unlocks the story. */
  firstLessonId: string | null;
  title: StoryBnText;
  summary?: string;
  draft: boolean;
  lines: StoryLine[];
  questions: StoryQuestion[];
}

/** List entry: everything but the lines. */
export type StorySummary = Pick<Story, "id" | "unit" | "unitTitle" | "unitNumber" | "firstLessonId" | "title" | "summary" | "draft"> & {
  lineCount: number;
  questionCount: number;
};
