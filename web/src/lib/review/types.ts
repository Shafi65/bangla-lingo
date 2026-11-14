/** A reviewable word as shipped to the practice and word-list pages. */
export interface ReviewWord {
  id: string;
  bn: string;
  tr: string;
  en: string;
  /** First lesson that teaches it. */
  lesson: string;
  lessonTitle: string;
  unit: string;
  unitTitle: string;
  /** A single script letter (reviewed as "which sound?" rather than meaning). */
  letter: boolean;
}
