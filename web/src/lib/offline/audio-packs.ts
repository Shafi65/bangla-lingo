// Pure: maps the recorded-audio manifest onto course units so audio can be downloaded per unit.
//
// A clip belongs to a unit when its text (the manifest key, NFC + trimmed, as in
// content/scripts/gen-audio.mjs) appears anywhere in one of that unit's lessons. Clips that no
// lesson uses (guide, dictionary, app strings) go into the "other" pack. "All" is every clip.

export interface UnitTexts {
  id: string;
  title: string;
  /** Every string that can be spoken in the unit's lessons (see collectStrings). */
  texts: Iterable<string>;
}

export interface AudioPack {
  id: string;
  title: string;
  /** Indices into AudioPackData.files / sizes. */
  idx: number[];
  bytes: number;
}

export interface AudioPackData {
  /** Unique clip file names, sorted. */
  files: string[];
  /** Byte size per file, parallel to `files`. */
  sizes: number[];
  packs: AudioPack[];
  totalBytes: number;
}

export const OTHER_PACK_ID = "other";
export const normalizeKey = (s: string) => s.normalize("NFC").trim();

/** Deep-collects string values (and space-joined string arrays, e.g. word-bank answers). */
export function collectStrings(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof value === "string") {
    out.add(value);
  } else if (Array.isArray(value)) {
    if (value.length > 1 && value.every((v) => typeof v === "string")) out.add(value.join(" "));
    for (const v of value) collectStrings(v, out);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectStrings(v, out);
  }
  return out;
}

export function buildAudioPacks(
  units: readonly UnitTexts[],
  items: Readonly<Record<string, string>>,
  sizeOf: (file: string) => number,
): AudioPackData {
  const files = [...new Set(Object.values(items))].sort();
  const index = new Map(files.map((f, i) => [f, i]));
  const sizes = files.map((f) => Math.max(0, sizeOf(f) || 0));

  const keyed = new Map<string, number>();
  for (const [key, file] of Object.entries(items)) keyed.set(normalizeKey(key), index.get(file)!);

  const used = new Set<number>();
  const packs: AudioPack[] = [];
  const make = (id: string, title: string, idx: Iterable<number>): AudioPack | null => {
    const list = [...new Set(idx)].sort((a, b) => a - b);
    if (list.length === 0) return null;
    return { id, title, idx: list, bytes: list.reduce((n, i) => n + sizes[i], 0) };
  };

  for (const u of units) {
    const hits: number[] = [];
    for (const t of u.texts) {
      const i = keyed.get(normalizeKey(t));
      if (i !== undefined) hits.push(i);
    }
    const pack = make(u.id, u.title, hits);
    if (pack) {
      packs.push(pack);
      pack.idx.forEach((i) => used.add(i));
    }
  }
  const other = make(
    OTHER_PACK_ID,
    "Guide, dictionary and extras",
    files.map((_, i) => i).filter((i) => !used.has(i)),
  );
  if (other) packs.push(other);

  return { files, sizes, packs, totalBytes: sizes.reduce((a, b) => a + b, 0) };
}

/** "28.4 MB", "640 KB", "0 B". */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  const mb = n / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** How much of `idx` is already in `cached` (a set of file names). */
export function packProgress(data: Pick<AudioPackData, "files" | "sizes">, idx: readonly number[], cached: ReadonlySet<string>) {
  let have = 0;
  let haveBytes = 0;
  for (const i of idx) {
    if (cached.has(data.files[i])) {
      have++;
      haveBytes += data.sizes[i];
    }
  }
  return { have, total: idx.length, haveBytes, complete: have === idx.length && idx.length > 0 };
}
