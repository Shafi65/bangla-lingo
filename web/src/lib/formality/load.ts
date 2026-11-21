// Server-only: reads content/formality/scenarios.json at build time. A missing or malformed file
// yields null (the page then says the trainer isn't available), so a content tree without it
// (e.g. the demo fixture) still builds.
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getContentBaseDir } from "../content";
import { isFormalityBank } from "./parse";
import type { FormalityBank } from "./types";

export function loadFormality(baseDir = getContentBaseDir()): FormalityBank | null {
  try {
    const data: unknown = JSON.parse(fs.readFileSync(path.join(baseDir, "formality", "scenarios.json"), "utf8"));
    return isFormalityBank(data) ? data : null;
  } catch {
    return null;
  }
}
