// TypeScript mirror of docs/CONTENT_SCHEMA.md. Keep in sync with the schema doc.

export type Track = "main" | "script";
export type Direction = "bn_to_en" | "en_to_bn";

/** Bengali text in all three forms. `tr` follows content/TRANSLITERATION.md. */
export interface BnText {
  bn: string;
  tr: string;
  en: string;
}

export interface VocabItem extends BnText {
  id: string;
  notes?: string;
}

export interface UnitDef {
  id: string;
  title: string;
  description?: string;
  track: Track;
  lessons: string[];
}

export interface CourseDef {
  id: string;
  title: string;
  units: UnitDef[];
}

interface ExerciseBase {
  id: string;
  /**
   * One short sentence shown after a wrong answer explaining the rule
   * (a quieter "Why?" line when correct). Supports **bold**, *italic*, `code`.
   */
  why?: string;
  /** Set by `npm run recycle` on generated review exercises. Never hand-written. */
  recycle?: true;
}

export interface SelectTranslationExercise extends ExerciseBase {
  type: "select_translation";
  prompt: BnText;
  direction: Direction;
  options: string[];
  answer: number;
}

export interface WordBankExercise extends ExerciseBase {
  type: "word_bank";
  prompt: BnText;
  direction: Direction;
  tiles: string[];
  answer: string[];
  /** Other correct tile sequences (e.g. "She is my teacher" for উনি আমার শিক্ষক). */
  alt?: string[][];
}

export interface MatchPairsExercise extends ExerciseBase {
  type: "match_pairs";
  pairs: BnText[];
}

export interface ListenSelectExercise extends ExerciseBase {
  type: "listen_select";
  audio: BnText;
  options: string[];
  answer: number;
}

export interface TypeTranslationExercise extends ExerciseBase {
  type: "type_translation";
  prompt: BnText;
  direction: Direction;
  accepted: string[];
}

export interface ScriptRecognizeExercise extends ExerciseBase {
  type: "script_recognize";
  glyph: string;
  options: string[];
  answer: number;
}

/**
 * A Bengali sentence with one gap. `sentence` is the complete correct sentence;
 * `blank` is the exact word/phrase of `sentence.bn` that is removed (it occurs
 * exactly once as a whole token sequence). Give EITHER `options` + `answer`
 * (choose the missing word) OR `accepted` (type it).
 */
export interface FillBlankExercise extends ExerciseBase {
  type: "fill_blank";
  sentence: BnText;
  blank: string;
  options?: string[];
  answer?: number;
  /** Typed variant: Bengali and transliteration spellings. `blank` itself is always accepted too. */
  accepted?: string[];
}

/** Hear a Bengali sentence, choose what it means. Text and transliteration stay hidden until checked. */
export interface ListenMeaningExercise extends ExerciseBase {
  type: "listen_meaning";
  audio: BnText;
  /** English meanings. */
  options: string[];
  answer: number;
}

export interface ReadingLine extends BnText {
  speaker?: string;
}

/** A short dialogue or text (2-8 lines) followed by one comprehension question. */
export interface ReadingExercise extends ExerciseBase {
  type: "reading";
  title?: string;
  lines: ReadingLine[];
  /** The question in English. With `questionBn` it is that question's English gloss. */
  question: string;
  /** Optional Bengali version of the question (shown as the main question). */
  questionBn?: BnText;
  options: string[];
  answer: number;
}

export type Exercise =
  | SelectTranslationExercise
  | WordBankExercise
  | MatchPairsExercise
  | ListenSelectExercise
  | TypeTranslationExercise
  | ScriptRecognizeExercise
  | FillBlankExercise
  | ListenMeaningExercise
  | ReadingExercise;

export type ExerciseType = Exercise["type"];

export interface Lesson {
  id: string;
  unit: string;
  title: string;
  /** "draft" = not yet native-speaker reviewed. */
  status?: string;
  reviewedBy?: string;
  tip?: string;
  vocab: VocabItem[];
  exercises: Exercise[];
}

/** What the course map needs: units with lesson titles resolved. */
/** Plan `kind` (content/plans/*.json); lessons without one are "lesson". */
export type LessonKind = "lesson" | "review" | "checkpoint";

export interface LessonSummary {
  id: string;
  title: string;
  /** From the unit's plan file; "lesson" when there is no plan or no `kind`. */
  kind: LessonKind;
  exerciseCount: number;
  /** True while the lesson is awaiting native-speaker review. */
  draft: boolean;
  /** Script lessons: a representative letter (first script_recognize glyph). */
  glyph?: string;
}

export interface UnitSummary {
  id: string;
  title: string;
  description?: string;
  track: Track;
  lessons: LessonSummary[];
}

export interface CourseSummary {
  id: string;
  title: string;
  units: UnitSummary[];
  /** "content" = real ../content, "fixture" = built-in demo fallback. */
  source: "content" | "fixture";
}
