// Server-only content loader. Reads course JSON from disk at build time.
//
// Lookup order:
//   1. $CONTENT_DIR (if set), else <repo>/content  (i.e. ../content relative to web/)
//      - course.json
//      - units/<unit-id>/<lesson-id>.json   (track "main")
//      - script/<unit-id>/<lesson-id>.json  (track "script")
//   2. If course.json is missing/invalid, or no listed lesson file loads,
//      fall back to the built-in fixture in web/src/fixtures/.
//
// Lessons listed in course.json whose file is missing or malformed are skipped
// with a build-time warning, so in-progress content never breaks the build.
import "server-only";
import fs from "node:fs";
import path from "node:path";
import type {
  CourseDef,
  CourseSummary,
  Exercise,
  Lesson,
  UnitDef,
} from "./types";

const WEB_ROOT = process.cwd();
const CONTENT_DIR = process.env.CONTENT_DIR
  ? path.resolve(process.env.CONTENT_DIR)
  : path.join(WEB_ROOT, "..", "content");
const FIXTURE_DIR = path.join(WEB_ROOT, "src", "fixtures");

const EXERCISE_TYPES = new Set<Exercise["type"]>([
  "select_translation",
  "word_bank",
  "match_pairs",
  "listen_select",
  "type_translation",
  "script_recognize",
]);

function warn(msg: string) {
  console.warn(`[content] ${msg}`);
}

function readJson(file: string): unknown | undefined {
  try {
    if (!fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    warn(`could not parse ${file}: ${(err as Error).message}`);
    return undefined;
  }
}

function isCourse(v: unknown): v is CourseDef {
  const c = v as CourseDef;
  return (
    !!c &&
    typeof c.id === "string" &&
    Array.isArray(c.units) &&
    c.units.every(
      (u) =>
        typeof u?.id === "string" &&
        (u.track === "main" || u.track === "script") &&
        Array.isArray(u.lessons),
    )
  );
}

function isLesson(v: unknown): v is Lesson {
  const l = v as Lesson;
  return (
    !!l &&
    typeof l.id === "string" &&
    Array.isArray(l.exercises) &&
    l.exercises.length > 0 &&
    l.exercises.every(
      (e) => typeof e?.id === "string" && EXERCISE_TYPES.has(e.type),
    )
  );
}

interface LoadedCourse {
  summary: CourseSummary;
  lessons: Map<string, Lesson>;
}

function lessonPath(baseDir: string, unit: UnitDef, lessonId: string) {
  const trackDir = unit.track === "script" ? "script" : "units";
  return path.join(baseDir, trackDir, unit.id, `${lessonId}.json`);
}

function loadFrom(
  baseDir: string,
  source: CourseSummary["source"],
): LoadedCourse | undefined {
  const raw = readJson(path.join(baseDir, "course.json"));
  if (raw === undefined) return undefined;
  if (!isCourse(raw)) {
    warn(`${baseDir}/course.json does not match the schema; ignoring`);
    return undefined;
  }

  const lessons = new Map<string, Lesson>();
  const units = raw.units.map((unit) => {
    const summaries = unit.lessons.flatMap((lessonId) => {
      const file = lessonPath(baseDir, unit, lessonId);
      const data = readJson(file);
      if (data === undefined) {
        warn(`missing lesson file ${file}; skipping`);
        return [];
      }
      if (!isLesson(data)) {
        warn(`lesson ${file} does not match the schema; skipping`);
        return [];
      }
      const lesson: Lesson = { ...data, vocab: data.vocab ?? [] };
      lessons.set(lesson.id, lesson);
      return [
        {
          id: lesson.id,
          title: lesson.title ?? lesson.id,
          exerciseCount: lesson.exercises.length,
        },
      ];
    });
    return {
      id: unit.id,
      title: unit.title ?? unit.id,
      description: unit.description,
      track: unit.track,
      lessons: summaries,
    };
  });

  if (lessons.size === 0) {
    warn(`${baseDir}/course.json lists no loadable lessons`);
    return undefined;
  }

  return {
    summary: {
      id: raw.id,
      title: raw.title ?? raw.id,
      // Units with no loadable lessons yet are kept; the map shows them as "coming soon".
      units,
      source,
    },
    lessons,
  };
}

let cached: LoadedCourse | undefined;

function load(): LoadedCourse {
  if (cached) return cached;
  const real = loadFrom(CONTENT_DIR, "content");
  if (real) {
    cached = real;
  } else {
    warn(`no usable content at ${CONTENT_DIR}; using built-in fixture`);
    const fixture = loadFrom(FIXTURE_DIR, "fixture");
    if (!fixture) throw new Error("Built-in fixture content failed to load");
    cached = fixture;
  }
  return cached;
}

export function getCourse(): CourseSummary {
  return load().summary;
}

export function getLesson(id: string): Lesson | undefined {
  return load().lessons.get(id);
}

export function getAllLessonIds(): string[] {
  return [...load().lessons.keys()];
}
