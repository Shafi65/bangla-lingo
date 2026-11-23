// Server-only: reads content/family/kin.json at build time. A missing or malformed file yields null
// (the page then says the feature isn't available), so a content tree without it (e.g. the demo
// fixture) still builds.
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getContentBaseDir } from "../content";
import { isKinData } from "./parse";
import type { KinData } from "./types";

export function loadKin(baseDir = getContentBaseDir()): KinData | null {
  try {
    const data: unknown = JSON.parse(fs.readFileSync(path.join(baseDir, "family", "kin.json"), "utf8"));
    return isKinData(data) ? data : null;
  } catch {
    return null;
  }
}
