// @vitest-environment jsdom
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildRound,
  clampTier,
  emptyStore,
  finishRound,
  isAccepted,
  seededRandom,
} from "@/lib/formality/engine";
import { loadFormality } from "@/lib/formality/load";
import { isFormalityBank } from "@/lib/formality/parse";
import { FORMALITY_KEY, parseStore, readStore, writeStore } from "@/lib/formality/storage";
import type { FormalityBank, FormalityResult, FormalityScenario } from "@/lib/formality/types";

const CONTENT = path.resolve(process.cwd(), "..", "content");
const raw = JSON.parse(fs.readFileSync(path.join(CONTENT, "formality", "scenarios.json"), "utf8")) as FormalityBank;

const results = (round: FormalityScenario[], right: number): FormalityResult[] =>
  round.map((s, i) => ({ id: s.id, chosen: i < right ? s.answer[0] : s.options.findIndex((_, k) => !s.answer.includes(k)), correct: i < right }));

describe("formality bank", () => {
  it("parses and loads the real content", () => {
    expect(isFormalityBank(raw)).toBe(true);
    const bank = loadFormality(CONTENT);
    expect(bank?.scenarios.length).toBe(raw.scenarios.length);
  });

  it("has enough scenarios in every tier for a full round", () => {
    for (const t of raw.tiers) expect(raw.scenarios.filter((s) => s.tier === t.id).length).toBeGreaterThanOrEqual(raw.roundSize);
  });

  it("returns null for a content tree without the file", () => {
    expect(loadFormality(path.join(os.tmpdir(), "no-such-content-dir"))).toBeNull();
  });

  it("rejects malformed banks", () => {
    expect(isFormalityBank({ ...raw, version: 2 })).toBe(false);
    const bad = structuredClone(raw);
    bad.scenarios[0].answer = [9];
    expect(isFormalityBank(bad)).toBe(false);
  });

  it("passes the content validator", () => {
    const out = execFileSync("node", [path.join(CONTENT, "scripts", "validate-formality.mjs")], { encoding: "utf8" });
    expect(out).toMatch(/0 errors/);
  });
});

describe("rounds", () => {
  it("draws only from tier 1 at first, all different", () => {
    const round = buildRound(raw, 1, seededRandom(1));
    expect(round).toHaveLength(raw.roundSize);
    expect(round.every((s) => s.tier === 1)).toBe(true);
    expect(new Set(round.map((s) => s.id)).size).toBe(round.length);
  });

  it("weights the newest unlocked tier but mixes in earlier ones", () => {
    const round = buildRound(raw, 3, seededRandom(7));
    expect(round).toHaveLength(raw.roundSize);
    const newest = round.filter((s) => s.tier === 3).length;
    expect(newest).toBe(Math.ceil(raw.roundSize / 2));
    expect(round.some((s) => s.tier === 1)).toBe(true);
    expect(round.some((s) => s.tier === 2)).toBe(true);
    expect(round.every((s) => s.tier <= 3)).toBe(true);
  });

  it("is deterministic for a seed", () => {
    const a = buildRound(raw, 4, seededRandom(42)).map((s) => s.id);
    const b = buildRound(raw, 4, seededRandom(42)).map((s) => s.id);
    expect(a).toEqual(b);
  });

  it("clamps the unlocked tier", () => {
    expect(clampTier(raw, 0)).toBe(1);
    expect(clampTier(raw, 99)).toBe(raw.tiers.length);
    expect(clampTier(raw, Number.NaN)).toBe(1);
  });

  it("accepts every listed answer", () => {
    const multi = raw.scenarios.find((s) => s.answer.length > 1)!;
    for (const a of multi.answer) expect(isAccepted(multi, a)).toBe(true);
    const wrong = multi.options.findIndex((_, k) => !multi.answer.includes(k));
    expect(isAccepted(multi, wrong)).toBe(false);
  });
});

describe("unlocking and best scores", () => {
  it("unlocks the next tier at the unlock score and keeps the best", () => {
    const round = buildRound(raw, 1, seededRandom(3));
    const pass = finishRound(raw, emptyStore(), round, results(round, raw.unlockScore));
    expect(pass.newlyUnlocked).toBe(2);
    expect(pass.store).toMatchObject({ unlocked: 2, rounds: 1, best: { "1": raw.unlockScore } });

    const worse = finishRound(raw, pass.store, round, results(round, 3));
    expect(worse.newlyUnlocked).toBeNull();
    expect(worse.store.best["1"]).toBe(raw.unlockScore);
    expect(worse.store.unlocked).toBe(2);
  });

  it("does not unlock below the unlock score, or from an older tier's round", () => {
    const round = buildRound(raw, 1, seededRandom(4));
    expect(finishRound(raw, emptyStore(), round, results(round, raw.unlockScore - 1)).newlyUnlocked).toBeNull();
    const store = { ...emptyStore(), unlocked: 3 };
    expect(finishRound(raw, store, round, results(round, raw.roundSize)).store.unlocked).toBe(3);
  });

  it("never goes past the last tier", () => {
    const top = raw.tiers.length;
    const round = buildRound(raw, top, seededRandom(5));
    const done = finishRound(raw, { ...emptyStore(), unlocked: top }, round, results(round, raw.roundSize));
    expect(done.store.unlocked).toBe(top);
    expect(done.newlyUnlocked).toBeNull();
  });
});

describe("storage", () => {
  afterEach(() => window.localStorage.clear());

  it("round-trips under banglalingo.formality.v1", () => {
    const s = { v: 1 as const, unlocked: 3, best: { "1": 9, "2": 7 }, rounds: 4 };
    expect(writeStore(s)).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(FORMALITY_KEY)!)).toEqual(s);
    expect(readStore()).toEqual(s);
  });

  it("falls back to a fresh store on bad data", () => {
    expect(parseStore("not json")).toEqual(emptyStore());
    expect(parseStore(JSON.stringify({ v: 2 }))).toEqual(emptyStore());
    expect(parseStore(JSON.stringify({ v: 1, unlocked: -1, best: { x: 3, "2": "a", "1": 5 }, rounds: 1.5 }))).toEqual({
      v: 1,
      unlocked: 1,
      best: { "1": 5 },
      rounds: 0,
    });
  });

  it("survives a throwing localStorage", () => {
    const orig = Object.getOwnPropertyDescriptor(window, "localStorage")!;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    try {
      expect(readStore()).toEqual(emptyStore());
      expect(writeStore(emptyStore())).toBe(false);
    } finally {
      Object.defineProperty(window, "localStorage", orig);
    }
  });
});
