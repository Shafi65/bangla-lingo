import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isItemBank, isPlacementConfig } from "@/lib/placement/parse";
import { BANDS, GROUPS, type ItemBank, type PlacementConfig } from "@/lib/placement/types";

const root = path.resolve(import.meta.dirname, "..", "..");
const dir = path.join(root, "content", "placement");
const bank = JSON.parse(fs.readFileSync(path.join(dir, "items.json"), "utf8")) as ItemBank;
const cfg = JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8")) as PlacementConfig;
const course = JSON.parse(fs.readFileSync(path.join(root, "content", "course.json"), "utf8")) as { units: { id: string }[] };

describe("real placement bank", () => {
  it("parses with the app's guards", () => {
    expect(isItemBank(bank)).toBe(true);
    expect(isPlacementConfig(cfg)).toBe(true);
  });

  it("has enough items per band and score group for the deepest path through each band", () => {
    const count = (band: string, group: string) => bank.items.filter((i) => i.band === band && cfg.skills[i.skill] === group).length;
    // routing (1 per group at A1/A2a, grammar at A2b) + block (3) + final (3) at the same band
    for (const band of ["A1", "A2a"]) for (const g of GROUPS) expect(count(band, g), `${band} ${g}`).toBeGreaterThanOrEqual(7);
    for (const g of GROUPS) expect(count("A2b", g), `A2b ${g}`).toBeGreaterThanOrEqual(g === "grammar" ? 7 : 6);
    for (const g of GROUPS) expect(count("B1", g), `B1 ${g}`).toBeGreaterThanOrEqual(3);
    expect(count("A0", "reading")).toBeGreaterThanOrEqual(cfg.stages.scriptCheck.slots.length);
  });

  it("uses only choice exercises with one in-range answer, and units from the course", () => {
    const units = new Set(course.units.map((u) => u.id));
    for (const it of bank.items) {
      const x = it.exercise as { options: string[]; answer: number; accepted?: unknown };
      expect(x.accepted).toBeUndefined();
      expect(x.answer).toBeGreaterThanOrEqual(0);
      expect(x.answer).toBeLessThan(x.options.length);
      expect(new Set(x.options).size).toBe(x.options.length);
      expect(units.has(it.unit), it.unit).toBe(true);
      expect(BANDS).toContain(it.band);
    }
  });

  it("passes validate-placement.mjs (tokens, clips, every adaptive path)", () => {
    const r = spawnSync(process.execPath, [path.join(root, "content", "scripts", "validate-placement.mjs")], { encoding: "utf8" });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/0 error\(s\)/);
  });
});
