// Server-only: reads content/placement/{items,config}.json at build time and the course in the
// shape the engine needs. Missing or malformed files yield null (the page then says the test
// isn't available), so a content tree without a placement bank still builds.
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getContentBaseDir, getCourse } from "../content";
import { isItemBank, isPlacementConfig } from "./parse";
import type { ItemBank, PlacementConfig, PlacementUnit } from "./types";

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

export interface PlacementData {
  bank: ItemBank;
  config: PlacementConfig;
  units: PlacementUnit[];
}

export function loadPlacement(baseDir = getContentBaseDir()): PlacementData | null {
  const bank = readJson(path.join(baseDir, "placement", "items.json"));
  const config = readJson(path.join(baseDir, "placement", "config.json"));
  if (!isItemBank(bank) || !isPlacementConfig(config)) return null;
  const units: PlacementUnit[] = getCourse().units.map((u) => ({
    id: u.id,
    title: u.title,
    track: u.track,
    level: u.level ?? "beginner",
    lessons: u.lessons.map((l) => l.id),
  }));
  return { bank, config, units };
}
