// Server-only: reads content/bazaar/stalls.json at build time. Missing or malformed = null (the page
// then says the bazaar isn't available), so a content tree without it still builds.
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getContentBaseDir } from "../content";
import { isBazaarBank } from "./engine";
import type { BazaarBank } from "./types";

export function loadBazaar(baseDir = getContentBaseDir()): BazaarBank | null {
  try {
    const data: unknown = JSON.parse(fs.readFileSync(path.join(baseDir, "bazaar", "stalls.json"), "utf8"));
    return isBazaarBank(data) ? data : null;
  } catch {
    return null;
  }
}
