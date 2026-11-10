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

export type Exercise =
  | SelectTranslationExercise
  | WordBankExercise
  | MatchPairsExercise
  | ListenSelectExercise
  | TypeTranslationExercise
  | ScriptRecognizeExercise;

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
export interface LessonSummary {
  id: string;
  title: string;
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
