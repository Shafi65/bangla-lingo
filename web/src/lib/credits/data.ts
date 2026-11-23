// Server-only loader for /credits: licence registry, app credits and every library item's source block.
// Reads ../content at build time (CONTENT_DIR overrides, like lib/content.ts). Anything unreadable is
// skipped here; `npm run validate` is what rejects bad entries.
import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { AppCredit, LibraryCredit, LibraryKind, Licence } from "./format";

const CONTENT_DIR = process.env.CONTENT_DIR
  ? path.resolve(process.env.CONTENT_DIR)
  : path.join(/* turbopackIgnore: true */ process.cwd(), "..", "content");

const KINDS: LibraryKind[] = ["stories", "words", "audio", "media"];

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export interface CreditsData {
  licences: Map<string, Licence>;
  app: AppCredit[];
  library: LibraryCredit[];
}

export function getCredits(contentDir: string = CONTENT_DIR): CreditsData {
  const reg = readJson<{ licences?: Licence[] }>(path.join(contentDir, "sources", "licences.json"));
  const licences = new Map((reg?.licences ?? []).map((l) => [l.id, l]));
  const app = readJson<{ credits?: AppCredit[] }>(path.join(contentDir, "sources", "app-credits.json"))?.credits ?? [];

  const library: LibraryCredit[] = [];
  for (const kind of KINDS) {
    const dir = path.join(contentDir, "library", kind);
    let files: string[] = [];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
    } catch {
      continue;
    }
    for (const f of files) {
      const item = readJson<{ id?: string; source?: LibraryCredit["source"] }>(path.join(dir, f));
      // Only allowed, known licences are ever shown (the validator blocks the rest before merge).
      if (item?.id && item.source && licences.get(item.source.licence)?.allowed) {
        library.push({ id: item.id, kind, source: item.source });
      }
    }
  }
  return { licences, app, library };
}
