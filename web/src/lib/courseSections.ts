// Course-map grouping: which units form a "section", and how units are numbered. Pure.
import type { CourseSummary, UnitSummary } from "./types";

export interface NumberedUnit {
  unit: UnitSummary;
  /** "Unit 3" / "Script 2": main units are numbered per level (beginner, intermediate), script units separately. */
  label: string;
}

export interface Section {
  n: number;
  /** From course.json "sections"; absent for the derived grouping. */
  title?: string;
  units: NumberedUnit[];
}

const isIntermediate = (u: UnitSummary) => u.level === "intermediate";

export function numberUnits(course: CourseSummary): NumberedUnit[] {
  let beginnerN = 0;
  let intermediateN = 0;
  let scriptN = 0;
  return course.units.map((unit) => ({
    unit,
    label: unit.track === "script" ? `Script ${++scriptN}` : `Unit ${isIntermediate(unit) ? ++intermediateN : ++beginnerN}`,
  }));
}

/**
 * Sections group the course into stages. When course.json defines `sections`, units are grouped by their
 * `section` (default 1) under the section titles, in section order; sections without units are left out.
 * Otherwise sections are derived: the main units up to and including the next script unit (the script
 * track is woven between main units).
 */
export function sectionsOf(course: CourseSummary): Section[] {
  const numbered = numberUnits(course);
  if (course.sections?.length) {
    const ids = course.sections.map((s) => s.id);
    // a unit pointing at an unlisted section joins the first listed one
    const secOf = (u: UnitSummary) => (ids.includes(u.section ?? 1) ? (u.section ?? 1) : ids[0]);
    return course.sections
      .map((s) => ({ n: s.id, title: s.title, units: numbered.filter((x) => secOf(x.unit) === s.id) }))
      .filter((s) => s.units.length > 0);
  }
  const out: Section[] = [];
  let cur: NumberedUnit[] = [];
  for (const { unit, label } of numbered) {
    cur.push({ unit, label });
    if (unit.track === "script") {
      out.push({ n: out.length + 1, units: cur });
      cur = [];
    }
  }
  if (cur.length) out.push({ n: out.length + 1, units: cur });
  return out;
}
