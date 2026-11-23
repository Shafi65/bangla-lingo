// @vitest-environment jsdom
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  addressChoices,
  addressOf,
  fillAddr,
  findTemplate,
  introFor,
  phrasesFor,
  pronounOf,
  pronounSpecOf,
  resolvePick,
  termOf,
  whoLabel,
} from "@/lib/family/compose";
import { loadKin } from "@/lib/family/load";
import { isKinData } from "@/lib/family/parse";
import { buildQuiz, seededRandom } from "@/lib/family/quiz";
import { FAMILY_KEY, emptyFamily, parseFamily, readFamily, removePerson, writeFamily } from "@/lib/family/storage";
import type { FamilyPerson, FamilyStore, KinData } from "@/lib/family/types";

const CONTENT = path.resolve(process.cwd(), "..", "content");
const VALIDATOR = path.join(CONTENT, "scripts", "validate-family.mjs");
const kin = JSON.parse(fs.readFileSync(path.join(CONTENT, "family", "kin.json"), "utf8")) as KinData;
const rel = (id: string) => kin.relations.find((r) => r.id === id)!;
const person = (r: string, extra: Partial<FamilyPerson> = {}): FamilyPerson => ({ id: `p-${r}`, rel: r, ...extra });

describe("kin data", () => {
  it("parses and loads the real content", () => {
    expect(isKinData(kin)).toBe(true);
    expect(loadKin(CONTENT)?.relations.length).toBe(kin.relations.length);
    expect(loadKin("/nonexistent")).toBeNull();
    expect(isKinData({ ...kin, version: 2 })).toBe(false);
  });

  it("passes npm run validate:family", () => {
    expect(() => execFileSync("node", [VALIDATOR], { encoding: "utf8" })).not.toThrow();
  });

  it("every relation is reachable through its group's questions", () => {
    for (const r of kin.relations) expect(resolvePick(kin, r.group, r.pick)?.id).toBe(r.id);
    expect(resolvePick(kin, "fathers-siblings", { gender: "m" })).toBeUndefined();
  });

  it("covers the required relations", () => {
    for (const id of ["fathers-father", "mothers-mother", "father-elder-brother", "mother-younger-sister", "elder-brother-wife",
      "elder-sister-husband", "husband-mother", "wife-younger-brother", "cousin-ms-son-elder", "sister-daughter", "son"])
      expect(rel(id)).toBeTruthy();
    expect(termOf(rel("mother-younger-sister"), "bd").ref.bn).toBe("ছোট খালা");
    expect(termOf(rel("mother-younger-sister"), "wb").ref.bn).toBe("ছোট মাসি");
    expect(termOf(rel("father-younger-brother"), "wb").ref.bn).toBe("কাকা");
    expect(termOf(rel("elder-brother-wife"), "wb").addr[0].bn).toBe("বৌদি");
  });

  it("every phrase the app composes with default or listed choices has an audio string from the validator", () => {
    const audio = new Set(JSON.parse(execFileSync("node", [VALIDATOR, "--audio"], { encoding: "utf8" })) as string[]);
    const missing: string[] = [];
    for (const r of kin.relations) {
      for (const v of kin.varieties.map((x) => x.id)) {
        const spec = pronounSpecOf(r, v);
        const calls = termOf(r, v).addr.map((a) => ({ type: "term" as const, bn: a.bn, tr: a.tr }));
        for (const pronoun of [spec.default, ...spec.also]) {
          for (const call of [undefined, ...calls, { type: "name" as const }]) {
            const p = person(r.id, { pronoun, call });
            for (const ph of phrasesFor(kin, p, r, v)) if (!audio.has(ph.audio)) missing.push(ph.audio);
            const intro = introFor(kin, p, r, v)!;
            if (!audio.has(intro.bn)) missing.push(intro.bn);
          }
        }
        if (!audio.has(termOf(r, v).ref.bn)) missing.push(termOf(r, v).ref.bn);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });
});

describe("compose", () => {
  it("fills and strips the address slot", () => {
    const t = findTemplate(kin, "how", "bd", "apni")!;
    expect(fillAddr(t, { bn: "খালা", tr: "khala" })).toEqual({ bn: "খালা, আপনি কেমন আছেন?", tr: "khala, apni kemon achhen?", en: "Khala, how are you?" });
    expect(fillAddr(t, null)).toEqual({ bn: "আপনি কেমন আছেন?", tr: "apni kemon achhen?", en: "How are you?" });
    const g = findTemplate(kin, "greet", "bd", "apni")!;
    expect(fillAddr(g, null).bn).toBe("আসসালামু আলাইকুম।");
  });

  it("builds a card for a mother's younger sister", () => {
    const r = rel("mother-younger-sister");
    const p = person(r.id, { name: "Rina" });
    expect(whoLabel(p, r)).toBe("Rina (Mum's younger sister)");
    expect(pronounOf(p, r, "bd")).toBe("apni");
    expect(pronounOf(p, r, "wb")).toBe("tumi");
    const phrases = phrasesFor(kin, p, r, "bd");
    expect(phrases.map((x) => x.kind)).toEqual(r.phrases);
    expect(phrases.find((x) => x.kind === "festival")!.bn).toContain("ঈদ মোবারক");
    expect(phrasesFor(kin, p, r, "wb").find((x) => x.kind === "festival")!.bn).toContain("শুভ বিজয়া");
    expect(introFor(kin, p, r, "bd")!.bn).toBe("উনি আমার ছোট খালা।");
  });

  it("follows overrides: pronoun, another listed word, a name, a custom word", () => {
    const r = rel("mother-younger-sister");
    const tumi = phrasesFor(kin, person(r.id, { pronoun: "tumi" }), r, "bd").find((x) => x.kind === "how")!;
    expect(tumi.bn).toBe("খালামণি, তুমি কেমন আছো?");
    const other = addressChoices(kin, r, "bd")[1];
    expect(addressOf(person(r.id, { call: { type: "term", ...other } }), r, "bd")).toEqual({ kind: "term", term: other });
    const byName = phrasesFor(kin, person(r.id, { name: "Rina", call: { type: "name" } }), r, "bd").find((x) => x.kind === "how")!;
    expect(byName.bn).toBe("আপনি কেমন আছেন?");
    expect(byName.en).toBe("Rina, how are you?");
    const custom = phrasesFor(kin, person(r.id, { call: { type: "custom", text: "Mimi" } }), r, "bd").find((x) => x.kind === "how")!;
    expect(custom.bn).toBe("Mimi, আপনি কেমন আছেন?");
    expect(custom.audio).toBe("আপনি কেমন আছেন?");
    // younger siblings are called by name
    expect(addressOf(person("younger-sister"), rel("younger-sister"), "bd")).toEqual({ kind: "name" });
  });
});

describe("storage", () => {
  afterEach(() => localStorage.clear());

  it("parses tolerantly", () => {
    expect(parseFamily(null)).toEqual(emptyFamily());
    expect(parseFamily("{bad")).toEqual(emptyFamily());
    expect(parseFamily(JSON.stringify({ v: 2, people: [] }))).toEqual(emptyFamily());
    const s = parseFamily(
      JSON.stringify({
        v: 1,
        variety: "wb",
        people: [
          { id: "p-a", rel: "mother", name: "  Amina  ", pronoun: "apni", call: { type: "term", bn: "মা", tr: "ma" }, junk: 1 },
          { id: "p-a", rel: "father" },
          { id: "BAD ID", rel: "father" },
          { id: "p-b", rel: "mother-younger-sister", linkedTo: "p-gone", pronoun: "you", call: { type: "custom", text: "" } },
        ],
        quiz: { rounds: 2, best: -1 },
      }),
    );
    expect(s.variety).toBe("wb");
    expect(s.people).toEqual([
      { id: "p-a", rel: "mother", name: "Amina", pronoun: "apni", call: { type: "term", bn: "মা", tr: "ma" } },
      { id: "p-b", rel: "mother-younger-sister" },
    ]);
    expect(s.quiz).toEqual({ rounds: 2, best: 0 });
  });

  it("writes and reads banglalingo.family.v1, and removes people with their links", () => {
    const s: FamilyStore = { ...emptyFamily(), people: [person("mother-elder-sister"), { id: "p-c", rel: "cousin-ms-son-elder", linkedTo: "p-mother-elder-sister" }] };
    expect(writeFamily(s)).toBe(true);
    expect(JSON.parse(localStorage.getItem(FAMILY_KEY)!).v).toBe(1);
    expect(readFamily()).toEqual(s);
    const after = removePerson(readFamily(), "p-mother-elder-sister");
    writeFamily(after);
    expect(readFamily().people).toEqual([{ id: "p-c", rel: "cousin-ms-son-elder" }]);
  });
});

describe("quiz", () => {
  const store: FamilyStore = {
    ...emptyFamily(),
    people: [
      person("mother"),
      person("mother-younger-sister", { name: "Rina" }),
      person("father-elder-brother"),
      person("younger-brother", { name: "Sami" }),
      person("elder-sister", { pronoun: "apni" }),
    ],
  };

  it("asks about every relative first, with one right answer among distinct options", () => {
    const qs = buildQuiz(kin, store, seededRandom(7));
    expect(qs.length).toBe(10);
    expect(new Set(qs.slice(0, 5).map((q) => q.personId)).size).toBe(5);
    for (const q of qs) {
      expect(q.answer.length).toBeGreaterThan(0);
      expect(new Set(q.options.map((o) => o.bn)).size).toBe(q.options.length);
      if (q.type !== "pronoun") expect(q.options.length).toBe(4);
    }
    const rina = qs.find((q) => q.personId === "p-mother-younger-sister" && q.type === "addr")!;
    expect(rina.prompt).toBe("What do you call Rina (Mum's younger sister)?");
    expect(rina.options[rina.answer[0]].bn).toBe("খালামণি");
    // the other listed word for her is not wrong, so it is never a distractor
    expect(rina.options.map((o) => o.bn)).not.toContain("খালা");
    // called by name: asked how you talk about him instead
    expect(qs.find((q) => q.personId === "p-younger-brother")!.type).toBe("ref");
    const sis = qs.find((q) => q.personId === "p-elder-sister" && q.type === "pronoun")!;
    expect(sis.answer).toEqual([0]);
  });

  it("is deterministic per seed and empty without relatives", () => {
    expect(buildQuiz(kin, store, seededRandom(3))).toEqual(buildQuiz(kin, store, seededRandom(3)));
    expect(buildQuiz(kin, emptyFamily(), seededRandom(3))).toEqual([]);
  });
});
