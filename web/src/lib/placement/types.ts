// Placement test data shapes. Mirrors content/placement/{items,config}.json (checked by
// content/scripts/validate-placement.mjs). Pure types: safe to import anywhere.
import type {
  FillBlankExercise,
  ListenMeaningExercise,
  ListenSelectExercise,
  ReadingExercise,
  ScriptRecognizeExercise,
  SelectTranslationExercise,
} from "../types";

/** Level bands, lowest first. A0 = alphabet, A1 = Units 1–5, A2a = 6–10, A2b = 11–12, B1 = intermediate. */
export const BANDS = ["A0", "A1", "A2a", "A2b", "B1"] as const;
export type Band = (typeof BANDS)[number];

export const SKILLS = ["listening", "reading-script", "vocabulary", "grammar"] as const;
export type Skill = (typeof SKILLS)[number];

/** Score groups: reading covers both script reading and vocabulary (both are read in script). */
export const GROUPS = ["listening", "reading", "grammar"] as const;
export type Group = (typeof GROUPS)[number];

/** Exercise types a placement item may use (choice only; nothing typed). */
export type PlacementExercise =
  | SelectTranslationExercise
  | ListenSelectExercise
  | ScriptRecognizeExercise
  | ListenMeaningExercise
  | FillBlankExercise
  | ReadingExercise;

export interface PlacementItem {
  id: string;
  band: Band;
  skill: Skill;
  /** Course unit the item draws on. */
  unit: string;
  /** The construction or task it checks. */
  target: string;
  exercise: PlacementExercise;
}

export interface ItemBank {
  version: 1;
  items: PlacementItem[];
}

/** One position in a stage: an item of this group (and skill, if given) at this band. */
export interface Slot {
  group: Group;
  band?: Band;
  skill?: Skill;
}

export type BlockId = "A" | "B" | "C";

export interface BackgroundOption {
  id: string;
  label: string;
}
export interface BackgroundQuestion {
  id: string;
  text: string;
  options: BackgroundOption[];
}

/** Answers to the background questions, by question id. */
export type Background = Readonly<Record<string, string | undefined>>;

/** Matches when every listed question's answer is one of the listed values. */
export type BackgroundRule = Readonly<Record<string, readonly string[]>>;

export interface PlacementConfig {
  version: 1;
  bands: { id: Band; label: string; startUnit?: string }[];
  skills: Record<Skill, Group>;
  stages: {
    scriptCheck: { slots: Slot[] };
    routing: { slots: Slot[]; cuts: { maxCorrect: number; block: BlockId }[] };
    blocks: Record<BlockId, { band: Band }>;
    blockSlots: Slot[];
    /** After the block: total of routing + block correct decides the final stage's band. */
    final: Record<BlockId, { maxTotal: number; band: Band }[]>;
  };
  earlyStop: {
    bottom: { maxRoutingCorrect: number; maxRoutingListeningCorrect: number };
    top: { block: BlockId; minTotal: number };
  };
  scoring: { passRatio: number; minItems: number };
  routes: {
    intermediate: { grammarAtLeast: Band; readingAtLeast: Band };
    fastLane: { listeningAtLeast: Band; readingBelow: Band };
  };
  background: {
    questions: BackgroundQuestion[];
    scriptCheckWhen: BackgroundRule;
    heritageWhen: BackgroundRule;
    varietyNoteWhen: BackgroundRule;
  };
}

export type StageId = "script" | "routing" | "block" | "final";

export interface AnswerRecord {
  itemId: string;
  band: Band;
  skill: Skill;
  group: Group;
  stage: StageId;
  correct: boolean;
  /** "I don't know" (scored as wrong). */
  skipped?: boolean;
}

export type StopReason = "complete" | "early-bottom" | "early-top" | "user";

export interface SessionState {
  seed: number;
  stage: StageId | "done";
  /** Item ids of the current stage, in order. */
  queue: string[];
  index: number;
  answers: AnswerRecord[];
  /** Every item id shown so far (never repeated). */
  used: string[];
  block?: BlockId;
  finalBand?: Band;
  stopReason?: StopReason;
  /** Slots that had to borrow an item from another band (a thin bank). */
  fallbacks: number;
}

/** The course as the placement needs it: units in course order. */
export interface PlacementUnit {
  id: string;
  title: string;
  track: "main" | "script";
  level: "beginner" | "intermediate";
  /** "reading" for Reading-track units: never a placement start, never marked done by placement. */
  strand?: "reading";
  lessons: string[];
}

export interface GroupResult {
  group: Group;
  correct: number;
  total: number;
  /** Highest band passed (≥ passRatio of at least minItems items), or null. */
  level: Band | null;
  byBand: Partial<Record<Band, { correct: number; total: number }>>;
}

export type RouteKind = "start" | "alphabet" | "fast-lane" | "standard" | "intermediate";

export interface Placement {
  route: RouteKind;
  /** What the learner is placed at, in plain words. */
  kind: "alphabet" | "beginner" | "intermediate";
  startUnitId: string;
  startLessonId: string;
  /** e.g. "Unit 6: At the bazaar". */
  startLabel: string;
  /** Lessons to mark as done when the learner accepts. */
  completeLessonIds: string[];
  explanation: string;
  notes: string[];
  groups: GroupResult[];
  bySkill: Record<Skill, { correct: number; total: number }>;
  heritage: boolean;
  partial: boolean;
  answered: number;
}
