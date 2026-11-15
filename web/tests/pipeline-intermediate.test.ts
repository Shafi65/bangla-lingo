import { afterAll, describe, expect, it } from "vitest";
import {
  ASSUMED_WORDS, DIALOGUE, INT_WORDS, cleanup, generate, makeContent, readJson, runScript, validate, writeJson, type Json,
} from "./helpers/pipeline-fixture";

// Levels, sections, assumed-known lists, intermediate rules, the intermediate recipe and recycle,
// all through the real scripts in content/scripts on tiny temp content dirs (CONTENT_DIR).
afterAll(cleanup);

const L1 = "units/i01-t/i01-l01.json";
const errorsOf = (out: string) => out.split("\n").filter((l) => l.startsWith("✗"));
const warningsOf = (out: string) => out.split("\n").filter((l) => l.startsWith("⚠"));
const bnOf = (xs: { bn: string }[]) => new Set(xs.map((x) => x.bn));
const ASSUMED_BN = bnOf(ASSUMED_WORDS);
const NEW_BN = bnOf(INT_WORDS);

/** Fixture with the intermediate lesson i01-l01 generated and registered. */
function withLesson(edit?: (files: Record<string, Json | null>) => void) {
  const dir = makeContent(edit);
  const g = generate(dir, "i01-l01");
  expect(g.code, g.out).toBe(0);
  return dir;
}
const lessonOf = (dir: string) => readJson(dir, L1);
const mutate = (dir: string, fn: (l: Json) => void) => { const l = lessonOf(dir); fn(l); writeJson(dir, L1, l); };
const kinds = (l: Json) => l.exercises.map((e: Json) => e.type);

describe("levels, sections and assumes in course.json", () => {
  it("the fixture and its generated intermediate lesson pass validate and validate --strict", () => {
    const dir = withLesson();
    for (const args of [[], ["--strict"]]) {
      const r = validate(dir, ...args);
      expect(errorsOf(r.out), r.out).toEqual([]);
      expect(r.code).toBe(0);
    }
  });

  it("rejects bad level, section, sections, assumes and scriptOnly values", () => {
    const bad = (edit: (f: Record<string, Json | null>) => void) => validate(makeContent(edit)).out;
    const unit = (f: Record<string, Json | null>) => (f["course.json"] as Json).units[1];
    expect(bad((f) => { unit(f).level = "expert"; })).toMatch(/bad level "expert"/);
    expect(bad((f) => { unit(f).section = 3; })).toMatch(/section 3 is not listed/);
    expect(bad((f) => { unit(f).section = 0; })).toMatch(/section must be a positive integer/);
    expect(bad((f) => { unit(f).assumes = ["nope"]; })).toMatch(/assumes "nope": no content\/assumed\/nope\.json/);
    expect(bad((f) => { unit(f).assumes = "bridge"; })).toMatch(/assumes must be an array/);
    expect(bad((f) => { unit(f).scriptOnly = "yes"; })).toMatch(/scriptOnly must be true or false/);
    expect(bad((f) => { (f["course.json"] as Json).sections = [{ id: 1, title: "A" }, { id: 1, title: "B" }]; })).toMatch(/duplicate section id 1/);
    expect(bad((f) => { (f["course.json"] as Json).sections = [{ id: 1 }]; })).toMatch(/sections\[0\]: missing title/);
    expect(bad((f) => { (f["course.json"] as Json).scriptOnly = true; })).toMatch(/scriptOnly is set per unit or lesson/);
    expect(bad((f) => { (f["plans/i01-t.json"] as Json).lessons[0].scriptOnly = 1; })).toMatch(/i01-l01: scriptOnly must be true or false/);
    const dir = withLesson();
    mutate(dir, (l) => { l.scriptOnly = "yes"; });
    expect(validate(dir).out).toMatch(/scriptOnly must be true or false/);
  });

  it("units without level/section/sections/assumes stay valid (missing = beginner, section 1)", () => {
    const r = validate(makeContent((f) => {
      const c = f["course.json"] as Json;
      delete c.sections;
      c.units = [c.units[0]];
      f["lexicon/i01-t.json"] = null; f["plans/i01-t.json"] = null; f["assumed/bridge.json"] = null;
    }));
    expect(errorsOf(r.out), r.out).toEqual([]);
  });

  it("units may carry section numbers without a sections list", () => {
    const r = validate(makeContent((f) => { delete (f["course.json"] as Json).sections; }));
    expect(errorsOf(r.out), r.out).toEqual([]);
  });
});

describe("assumed-known lists (content/assumed/<name>.json)", () => {
  it("validates entries: slug id, bn/tr/en, pos, name matching the file", () => {
    const withEntry = (e: Json) => validate(makeContent((f) => { (f["assumed/bridge.json"] as Json).entries.push(e); })).out;
    expect(withEntry({ id: "Bad Id", bn: "বই", tr: "boi", en: "book", pos: "noun" })).toMatch(/id must be a lowercase slug/);
    expect(withEntry({ id: "boi", bn: "বই", tr: "boi", en: "book", pos: "thing" })).toMatch(/pos "thing" invalid/);
    expect(withEntry({ id: "boi", bn: "বই", en: "book", pos: "noun" })).toMatch(/missing tr/);
    expect(withEntry({ id: "boi", bn: "book", tr: "boi", en: "book", pos: "noun" })).toMatch(/no Bengali characters/);
    expect(withEntry({ id: "boi", bn: "বই", tr: "boi", en: "book", pos: "noun", alt: [] })).toMatch(/alt must be string\[\]/);
    expect(validate(makeContent((f) => { (f["assumed/bridge.json"] as Json).name = "other"; })).out).toMatch(/name "other" doesn't match file name/);
    const ok = validate(makeContent((f) => { (f["assumed/bridge.json"] as Json).entries.push({ id: "boi", bn: "বই", tr: "boi", en: "book", pos: "noun", alt: ["a book"], notes: "n" }); }));
    expect(errorsOf(ok.out), ok.out).toEqual([]);
  });

  it("ids must not collide with lexicon ids, nor repeat", () => {
    const r = validate(makeContent((f) => { (f["assumed/bridge.json"] as Json).entries.push({ id: "ami", bn: "আমি", tr: "ami", en: "I", pos: "pronoun" }); }));
    expect(r.out).toMatch(/id collides with lexicon id "ami"/);
    expect(r.code).toBe(1);
    expect(validate(makeContent((f) => { const e = (f["assumed/bridge.json"] as Json).entries; e.push({ ...e[0] }); })).out).toMatch(/duplicate assumed id/);
    expect(validate(makeContent((f) => {
      f["assumed/extra.json"] = { name: "extra", entries: [{ ...ASSUMED_WORDS[0], bn: "ঘর" }] };
    })).out).toMatch(/also in assumed\/bridge\.json with different spelling/);
  });

  it("units that list a list may use its words in plans, dialogues and exercises; other units may not", () => {
    // plan sentences: without `assumes`, the bridge words are not taught
    const noAssume = (f: Record<string, Json | null>) => {
      delete (f["course.json"] as Json).units[1].assumes;
      (f["plans/i01-t.json"] as Json).lessons[0].review = ["ami", "tumi", "bhalo"];
    };
    const r = validate(makeContent(noAssume));
    expect(r.out).toMatch(/word\(s\) not yet taught: .*বাড়ি/);
    expect(r.out).toMatch(/dialogue\.lines\[1\].*not yet taught/);
    expect(validate(makeContent()).out).not.toMatch(/not yet taught/);
    // review lists may name assumed entries only when the unit assumes the list
    expect(validate(makeContent((f) => { delete (f["course.json"] as Json).units[1].assumes; })).out).toMatch(/review "bari" not in lexicon/);

    // exercises (strict): the same word in a beginner lesson is untaught until its unit assumes the list
    const strictWith = (assumes?: string[]) => validate(makeContent((f) => {
      const lesson = f["units/u01-t/u01-l01.json"] as Json;
      lesson.exercises.push({ id: "x1", type: "select_translation", direction: "bn_to_en", prompt: { bn: "বাড়ি", tr: "bari", en: "home" }, options: ["home", "no", "yes"], answer: 0 });
      if (assumes) (f["course.json"] as Json).units[0].assumes = assumes;
    }), "--strict");
    expect(strictWith().out).toMatch(/\[strict:untaught\].*"বাড়ি" shown before it is taught \(not in the lexicon\)/);
    expect(errorsOf(strictWith(["bridge"]).out).filter((e) => /untaught/.test(e))).toEqual([]);
  });

  it("assumed words are not course vocabulary: no recycling/review/target stats for them", () => {
    const dir = withLesson();
    const r = runScript("audit.mjs", dir, ["--json"]);
    const j = JSON.parse(r.stdout);
    expect(j.reviewCoverage.find((c: Json) => c.unit === "i01-t").words).toBe(INT_WORDS.length - 1); // lexicon only (the name is excluded)
    expect(j.thinTargets.join(" ")).not.toMatch(/bari|amar|ekhon|achhe|shokal|jai/);
    expect(j.untaughtTokens).toBe(0);
  });
});

describe("dialogue in plans", () => {
  const dlg = (edit: (d: Json) => void) => validate(makeContent((f) => edit((f["plans/i01-t.json"] as Json).lessons[0].dialogue))).out;
  it("accepts the field and checks lines and questions", () => {
    expect(errorsOf(dlg(() => {}))).toEqual([]);
    expect(dlg((d) => { d.lines = [d.lines[0]]; })).toMatch(/dialogue: needs 2–8 lines/);
    expect(dlg((d) => { d.lines[1].speaker = undefined; })).toMatch(/give every line a speaker, or none/);
    expect(dlg((d) => { d.lines[0].tr = undefined; })).toMatch(/lines\[0\]: missing tr/);
    expect(dlg((d) => { d.questions = []; })).toMatch(/needs at least one question/);
    expect(dlg((d) => { d.questions[0].question = "কোথায়?"; })).toMatch(/question is English/);
    expect(dlg((d) => { d.questions[0].answer = 5; })).toMatch(/answer index 5 out of range/);
    expect(dlg((d) => { d.questions[0].options = ["At home", "আমি"]; })).toMatch(/all English or all Bengali/);
    expect(dlg((d) => { d.title = ""; })).toMatch(/title must be a non-empty string/);
  });
  it("taught-before-used applies to lines, questionBn and Bengali options", () => {
    expect(dlg((d) => { d.lines[0].bn = "তুমি বই?"; })).toMatch(/lines\[0\]: word\(s\) not yet taught: বই/);
    expect(dlg((d) => { d.questions[0].questionBn = { bn: "কই?", tr: "koi?", en: "Where?" }; })).toMatch(/questionBn word\(s\) not yet taught: কই/);
    expect(dlg((d) => { d.questions[0].options = ["বাড়ি", "ঘর"]; })).toMatch(/option "ঘর" has word\(s\) not yet taught/);
  });
  it("an intermediate plan lesson without a dialogue gets a warning (not for reviews)", () => {
    const noDlg = (extra: Json = {}) => runScript("validate.mjs", makeContent((f) => {
      const l = (f["plans/i01-t.json"] as Json).lessons[0];
      delete l.dialogue;
      Object.assign(l, extra);
    }), []).out;
    expect(noDlg()).toMatch(/i01-l01: no dialogue/);
    expect(noDlg({ kind: "review" })).not.toMatch(/i01-l01: no dialogue/);
  });
});

describe("intermediate rules in the validator", () => {
  it("normal mode: 12-18 hand-written exercises (beginner stays 8-15)", () => {
    const dir = withLesson();
    expect(lessonOf(dir).exercises.length).toBeGreaterThanOrEqual(12);
    expect(lessonOf(dir).exercises.length).toBeLessThanOrEqual(18);
    const run = () => warningsOf(validate(dir).out.concat("\n", runScript("validate.mjs", dir).out)).join("\n");
    expect(run()).not.toMatch(/i01-l01.*hand-written exercises/);
    mutate(dir, (l) => { l.exercises = l.exercises.slice(0, 10); });
    expect(run()).toMatch(/i01-l01\.json: 10 hand-written exercises \(target 12–18\)/);
    mutate(dir, (l) => { l.exercises = [...l.exercises, ...l.exercises].map((e: Json, i: number) => ({ ...e, id: `x${i}` })).slice(0, 19); });
    expect(run()).toMatch(/19 hand-written exercises \(target 12–18\)/);
    expect(run()).toMatch(/u01-l01\.json: 4 hand-written exercises \(target 8–15\)/);
  });

  it("strict: at most 12 new words for intermediate lessons (10 for beginner)", () => {
    const dir = withLesson();
    const vocab = lessonOf(dir).vocab;
    mutate(dir, (l) => { l.vocab = Array.from({ length: 12 }, () => vocab[0]); });
    expect(validate(dir, "--strict").out).not.toMatch(/too-many-new/);
    mutate(dir, (l) => { l.vocab = Array.from({ length: 13 }, () => vocab[0]); });
    expect(validate(dir, "--strict").out).toMatch(/\[strict:too-many-new\] introduces 13 new items \(max 12\)/);
    const begin = makeContent((f) => { const v = (f["units/u01-t/u01-l01.json"] as Json).vocab; (f["units/u01-t/u01-l01.json"] as Json).vocab = Array.from({ length: 11 }, () => v[0]); });
    expect(validate(begin, "--strict").out).toMatch(/\[strict:too-many-new\] introduces 11 new items \(max 10\)/);
  });

  it("strict: every non-review lesson needs a reading and a listen_meaning", () => {
    const dir = withLesson();
    mutate(dir, (l) => { l.exercises = l.exercises.filter((e: Json) => e.type !== "reading"); });
    expect(validate(dir, "--strict").out).toMatch(/\[strict:int-reading\] intermediate lesson has no reading exercise/);
    expect(validate(dir, "--strict").out).not.toMatch(/int-listen\]/);
    mutate(dir, (l) => { l.exercises = l.exercises.filter((e: Json) => e.type !== "listen_meaning"); });
    expect(validate(dir, "--strict").out).toMatch(/\[strict:int-listen\] intermediate lesson has no listen_meaning exercise/);
    expect(validate(dir).out).not.toMatch(/int-/); // normal mode doesn't enforce it
    // review lessons are exempt
    const review = makeContent((f) => { (f["plans/i01-t.json"] as Json).lessons[0].kind = "review"; });
    generate(review, "i01-l01");
    mutate(review, (l) => { l.exercises = l.exercises.filter((e: Json) => e.type !== "reading" && e.type !== "listen_meaning"); });
    expect(validate(review, "--strict").out).not.toMatch(/int-reading|int-listen/);
  });

  it("strict: unit skill shares (en->bn >=55%, typed >=15%, sentence listening >=20%)", () => {
    const dir = withLesson();
    expect(validate(dir, "--strict").out).not.toMatch(/int-(en-to-bn|typed|sentence)/);
    const sel = (i: number, w: Json) => ({ id: `s${i}`, type: "select_translation", direction: "bn_to_en", prompt: w, options: [w.en, "no", "yes"], answer: 0 });
    // en->bn share: flip every directed exercise to bn->en
    mutate(dir, (l) => { for (const e of l.exercises) if (e.direction) e.direction = "bn_to_en"; });
    expect(validate(dir, "--strict").out).toMatch(/i01-t: \[strict:int-en-to-bn\] English→Bengali is \d+% of directed exercises .*need ≥55%/);
    // typed share: drop typed exercises
    const dir2 = withLesson();
    mutate(dir2, (l) => { l.exercises = l.exercises.filter((e: Json) => !(e.type === "type_translation" || (e.type === "fill_blank" && e.accepted))); });
    expect(validate(dir2, "--strict").out).toMatch(/i01-t: \[strict:int-typed\] typed Bengali is \d+% .*need ≥15%/);
    // sentence-level listening share: keep one reading and one listen_meaning among many other exercises
    const dir3 = withLesson();
    mutate(dir3, (l) => {
      const keep = [l.exercises.find((e: Json) => e.type === "reading"), l.exercises.find((e: Json) => e.type === "listen_meaning")];
      const rest = l.exercises.filter((e: Json) => e.type !== "reading" && e.type !== "listen_meaning");
      l.exercises = [...keep, ...rest].map((e: Json, i: number) => ({ ...e, id: `z${i}` }));
      l.exercises.push(...Array.from({ length: 4 }, (_, i) => sel(i, INT_WORDS[i])));
    });
    expect(validate(dir3, "--strict").out).toMatch(/i01-t: \[strict:int-sentence-listening\] sentence-level listening is \d+% .*need ≥20%/);
    // the same lessons as a beginner unit: no intermediate rules
    for (const d of [dir, dir2, dir3]) {
      const course = readJson(d, "course.json");
      delete course.units[1].level;
      writeJson(d, "course.json", course);
      expect(validate(d, "--strict").out).not.toMatch(/int-/);
    }
  });
});

describe("audit and status per level", () => {
  it("audit reports each level with its targets, and the intermediate shares per unit", () => {
    const dir = withLesson();
    const text = runScript("audit.mjs", dir).out;
    expect(text).toMatch(/PER LEVEL/);
    expect(text).toMatch(/beginner: 1 units · 1 lessons · 4 exercises/);
    expect(text).toMatch(/target ≥45% BELOW\) · typed Bengali 0% \(target ≥8% BELOW\)/); // beginner targets
    expect(text).toMatch(/intermediate: 1 units · 1 lessons · 16 exercises/);
    expect(text).toMatch(/new items per lesson: max 12/);
    expect(text).toMatch(/target ≥55% ok\) · typed Bengali \d+% \(target ≥15% ok\) · sentence-level listening \d+% \(target ≥20% ok\)/);
    expect(text).toMatch(/i01-t\s+en→bn 100% ok · typed\s+\d+% ok · sentence listening\s+\d+% ok/);
    const j = JSON.parse(runScript("audit.mjs", dir, ["--json"]).stdout);
    expect(j.levels.map((x: Json) => x.level)).toEqual(["beginner", "intermediate"]);
    expect(j.levels[1].targets).toEqual({ enToBn: 55, typedBn: 15, sentListen: 20 });
    expect(j.levels[0].targets).toEqual({ enToBn: 45, typedBn: 8, sentListen: null });
    expect(j.levels[1].perUnit).toHaveLength(1);
  });
  it("audit marks a unit BELOW target", () => {
    const dir = withLesson();
    mutate(dir, (l) => { for (const e of l.exercises) if (e.direction) e.direction = "bn_to_en"; });
    expect(runScript("audit.mjs", dir).out).toMatch(/i01-t\s+en→bn\s+\d+% BELOW/);
  });
  it("status shows a line per level", () => {
    const out = runScript("status.mjs", withLesson()).out;
    expect(out).toMatch(/beginner\s+1 units · 2 planned · 1 draft · 0 reviewed · 4 lexicon · 0 sentences — 50% authored/);
    expect(out).toMatch(/intermediate\s+1 units · 2 planned · 1 draft · 0 reviewed · 7 lexicon · 7 sentences — 50% authored/);
  });
});

describe("gen-lesson: intermediate recipe", () => {
  it("builds warm-up, reading, listen_meaning, fill_blank, word bank and typing, in that order", () => {
    const dir = withLesson();
    const l = lessonOf(dir);
    expect(l.status).toBe("draft");
    expect(l.vocab.map((v: Json) => v.id)).toEqual(INT_WORDS.map((w) => w.id));
    expect(l.exercises.length).toBeGreaterThanOrEqual(12);
    expect(l.exercises.length).toBeLessThanOrEqual(18);
    const order = ["select_translation", "reading", "listen_meaning", "fill_blank", "word_bank", "type_translation"];
    const seq: string[] = kinds(l).filter((t: string, i: number, a: string[]) => a.indexOf(t) === i);
    expect(seq).toEqual(order);
    expect(l.exercises.map((e: Json) => e.id)).toEqual(l.exercises.map((_: Json, i: number) => `e${String(i + 1).padStart(2, "0")}`));
    // warm-up: 3 English->Bengali recall selects on review/known words, never this lesson's new words (not even as options)
    const warm = l.exercises.slice(0, 3);
    for (const e of warm) {
      expect(e).toMatchObject({ type: "select_translation", direction: "en_to_bn" });
      expect(NEW_BN.has(e.prompt.bn)).toBe(false);
      expect(e.options.some((o: string) => NEW_BN.has(o))).toBe(false);
    }
    expect(warm.map((e: Json) => e.prompt.bn)).toEqual(expect.arrayContaining([expect.any(String)]));
  });

  it("builds the readings from the plan dialogue", () => {
    const l = lessonOf(withLesson());
    const readings = l.exercises.filter((e: Json) => e.type === "reading");
    expect(readings).toHaveLength(2); // one per question, at most 2
    readings.forEach((r: Json, i: number) => {
      expect(r.title).toBe(DIALOGUE.title);
      expect(r.lines).toEqual(DIALOGUE.lines);
      expect(r.question).toBe(DIALOGUE.questions[i].question);
      expect(r.options).toEqual(DIALOGUE.questions[i].options);
      expect(r.answer).toBe(DIALOGUE.questions[i].answer);
    });
  });

  it("builds listen_meaning from plan sentences, with English options and the right answer", () => {
    const l = lessonOf(withLesson());
    const listens = l.exercises.filter((e: Json) => e.type === "listen_meaning");
    expect(listens).toHaveLength(3);
    const plan = readJson(makeContent(), "plans/i01-t.json").lessons[0].sentences as Json[];
    for (const e of listens) {
      const s = plan.find((x) => x.bn === e.audio.bn);
      expect(s, e.audio.bn).toBeTruthy();
      expect(e.audio).toEqual({ bn: s!.bn, tr: s!.tr, en: s!.en });
      expect(e.options[e.answer]).toBe(s!.en);
      expect(new Set(e.options).size).toBe(e.options.length);
      expect(e.options.some((o: string) => /[ঀ-৿]/.test(o))).toBe(false);
    }
    expect(new Set(listens.map((e: Json) => e.audio.bn)).size).toBe(3);
  });

  it("fill_blank targets new words inside plan sentences: choice first, typed last", () => {
    const l = lessonOf(withLesson());
    const fills = l.exercises.filter((e: Json) => e.type === "fill_blank");
    expect(fills.length).toBe(4);
    const firstTyped = fills.findIndex((e: Json) => e.accepted);
    expect(firstTyped).toBeGreaterThan(0);
    expect(fills.slice(firstTyped).every((e: Json) => e.accepted)).toBe(true);
    expect(fills.slice(0, firstTyped).every((e: Json) => e.options)).toBe(true);
    for (const e of fills) {
      expect(NEW_BN.has(e.blank), e.blank).toBe(true);
      expect(e.sentence.bn.split(/[\s।?]+/).filter((w: string) => w === e.blank)).toHaveLength(1);
      if (e.options) expect(e.options[e.answer]).toBe(e.blank);
      else expect(e.accepted).toContain(e.blank);
    }
    // the typed variant accepts the transliteration too
    expect(fills[fills.length - 1].accepted.length).toBeGreaterThanOrEqual(2);
  });

  it("word bank and typing are English->Bengali", () => {
    const l = lessonOf(withLesson());
    const banks = l.exercises.filter((e: Json) => e.type === "word_bank");
    const types = l.exercises.filter((e: Json) => e.type === "type_translation");
    expect(banks).toHaveLength(2);
    expect(types).toHaveLength(2);
    for (const e of [...banks, ...types]) expect(e.direction).toBe("en_to_bn");
    for (const e of banks) {
      const pool = [...e.tiles];
      for (const a of e.answer) pool.splice(pool.indexOf(a), 1); // answer tiles are all present
      expect(e.answer.join(" ")).toBe(e.prompt.bn.replace(/[।?]/g, "").trim());
    }
    for (const e of types) expect(e.accepted).toEqual([e.prompt.bn, e.prompt.tr]);
  });

  it("every new word meets recognition first (validate --strict agrees) and assumed words serve as distractors", () => {
    const dir = withLesson();
    const r = validate(dir, "--strict");
    expect(errorsOf(r.out), r.out).toEqual([]);
    const strings: string[] = [];
    for (const e of lessonOf(dir).exercises) strings.push(...(e.options ?? []), ...(e.tiles ?? []));
    expect(strings.some((s) => ASSUMED_BN.has(s))).toBe(true);
  });

  it("is deterministic, refuses to overwrite without --force, and registers the lesson in the content dir's course.json", () => {
    const dir = withLesson();
    expect(readJson(dir, "course.json").units[1].lessons).toEqual(["i01-l01"]);
    const dry = generate(dir, "i01-l01", "--dry");
    expect(dry.code).toBe(0);
    expect(JSON.parse(dry.stdout)).toEqual(lessonOf(dir));
    const again = generate(dir, "i01-l01");
    expect(again.code).toBe(1);
    expect(again.out).toMatch(/exists — use --force/);
    expect(generate(dir, "i01-l01", "--force").code).toBe(0);
    expect(lessonOf(dir)).toEqual(JSON.parse(dry.stdout));
    expect(readJson(dir, "course.json").units[1].lessons).toEqual(["i01-l01"]);
  });

  it("passes the plan's scriptOnly flag and tip to the lesson; works without a dialogue (no reading then)", () => {
    const dir = withLesson((f) => {
      const l = (f["plans/i01-t.json"] as Json).lessons[0];
      l.scriptOnly = true;
      delete l.dialogue;
    });
    const l = lessonOf(dir);
    expect(l.scriptOnly).toBe(true);
    expect(l.tip).toBe("A **tip**.");
    expect(kinds(l)).not.toContain("reading");
    expect(validate(dir, "--strict").out).toMatch(/int-reading/);
  });

  it("a unit without level still gets the standard beginner recipe", () => {
    const dir = makeContent((f) => { delete (f["course.json"] as Json).units[1].level; });
    const g = generate(dir, "i01-l01", "--dry");
    expect(g.code, g.out).toBe(0);
    const types = new Set(JSON.parse(g.stdout).exercises.map((e: Json) => e.type));
    for (const t of ["reading", "listen_meaning", "fill_blank"]) expect(types.has(t)).toBe(false);
    expect(JSON.parse(g.stdout).exercises.some((e: Json) => e.type === "word_bank" && e.direction === "bn_to_en")).toBe(true);
  });
});

describe("recycle for intermediate units", () => {
  /** u01-l01 (beginner) + generated i01-l01 + a hand-written i01-l02 in the same unit. */
  function course() {
    const dir = withLesson((f) => {
      (f["plans/i01-t.json"] as Json).lessons[1] = { id: "i01-l02", title: "Next", new: [], review: ["ami"], sentences: [] };
    });
    const l2 = {
      id: "i01-l02", unit: "i01-t", title: "Next", status: "draft", vocab: [],
      exercises: INT_WORDS.slice(0, 3).map((w, i) => ({ id: `e${i + 1}`, type: "select_translation", direction: "bn_to_en", prompt: { bn: w.bn, tr: w.tr, en: w.en }, options: [w.en, "no", "yes"], answer: 0 })),
    };
    writeJson(dir, "units/i01-t/i01-l02.json", l2);
    const c = readJson(dir, "course.json");
    c.units[1].lessons = ["i01-l01", "i01-l02"];
    writeJson(dir, "course.json", c);
    return dir;
  }
  const recycled = (dir: string, f: string) => readJson(dir, f).exercises.filter((e: Json) => e.recycle === true);
  const L2 = "units/i01-t/i01-l02.json";

  it("uses fill_blank (choose and typed) and listen_meaning as well as the existing forms, and passes validate --strict", () => {
    const dir = course();
    const r = runScript("recycle.mjs", dir, ["--count", "6"]);
    expect(r.code, r.out).toBe(0);
    const ex = recycled(dir, L2);
    expect(ex.length).toBe(6);
    const sig = (e: Json) => e.type + (e.direction ? ":" + e.direction : "") + (e.type === "fill_blank" ? (e.options ? ":choose" : ":typed") : "");
    const got = new Set(ex.map(sig));
    for (const k of ["fill_blank:choose", "fill_blank:typed", "listen_meaning"]) expect(got.has(k), [...got].join(" ")).toBe(true);
    expect(ex.map((e: Json) => e.id)).toEqual(["r01", "r02", "r03", "r04", "r05", "r06"]);
    // taught-before-used, recognition order and the rest hold for the recycled exercises too (the hand-written
    // l02 is a bare stand-in, so its missing reading/listening and the unit's missing review lesson are expected)
    const v = validate(dir, "--strict");
    expect(errorsOf(v.out).filter((e) => !/int-reading|int-listen|review-coverage/.test(e)), v.out).toEqual([]);
  });

  it("only tests course words: assumed-known words are distractors at most, never targets", () => {
    const dir = course();
    runScript("recycle.mjs", dir, ["--count", "6", "--pairs", "1"]);
    for (const f of [L1, L2]) for (const e of recycled(dir, f)) {
      const targets: string[] = [];
      if (e.type === "fill_blank") targets.push(e.blank);
      if (e.prompt) targets.push(e.prompt.bn);
      if (e.type === "listen_select") targets.push(e.audio.bn);
      if (e.type === "match_pairs") targets.push(...e.pairs.map((p: Json) => p.bn));
      for (const t of targets) expect(ASSUMED_BN.has(t), `${f} ${e.id} targets assumed word ${t}`).toBe(false);
    }
  });

  it("never touches hand-written exercises and is idempotent", () => {
    const dir = course();
    const hand = (f: string) => readJson(dir, f).exercises.filter((e: Json) => e.recycle !== true);
    const before = { l1: hand(L1), l2: hand(L2), u: hand("units/u01-t/u01-l01.json") };
    runScript("recycle.mjs", dir, ["--count", "6"]);
    expect({ l1: hand(L1), l2: hand(L2), u: hand("units/u01-t/u01-l01.json") }).toEqual(before);
    expect(recycled(dir, "units/u01-t/u01-l01.json")).toEqual([]); // the course's first main lesson gets none
    const snapshot = [L1, L2].map((f) => JSON.stringify(readJson(dir, f)));
    const dry = runScript("recycle.mjs", dir, ["--count", "6", "--dry"]);
    expect(dry.out).toMatch(/0 lessons would change/);
    const again = runScript("recycle.mjs", dir, ["--count", "6"]);
    expect(again.out).toMatch(/0 lessons changed/);
    expect([L1, L2].map((f) => JSON.stringify(readJson(dir, f)))).toEqual(snapshot);
    // and it rebuilds the recycled exercises from scratch (count changes are applied, hand-written stay)
    runScript("recycle.mjs", dir, ["--count", "2"]);
    expect(recycled(dir, L2).length).toBe(2);
    expect(hand(L2)).toEqual(before.l2);
  });
});

describe("gen-audio collects assumed words and plan dialogues", () => {
  const strings = (dir: string) => {
    const r = runScript("gen-audio.mjs", dir, ["--dry"]);
    expect(r.code, r.out).toBe(0);
    return Number(/Bengali strings: (\d+)/.exec(r.stdout)![1]);
  };
  it("counts assumed entries and dialogue lines (a unique line adds one string)", () => {
    const withAssumed = strings(makeContent());
    const without = strings(makeContent((f) => { f["assumed/bridge.json"] = null; delete (f["course.json"] as Json).units[1].assumes; (f["plans/i01-t.json"] as Json).lessons[0].review = ["ami"]; }));
    // the six assumed words are separate strings (the plan sentences are whole sentences)
    expect(withAssumed - without).toBe(ASSUMED_WORDS.length);
    const extraLine = strings(makeContent((f) => { (f["plans/i01-t.json"] as Json).lessons[0].dialogue.lines[0].bn = "তুমি কোথায় আছ?"; }));
    expect(extraLine - withAssumed).toBe(1);
  });
});
