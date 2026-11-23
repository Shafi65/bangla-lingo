// Server document formats and tolerant parsers. Everything read from the server is untrusted and
// goes through the same sanitizers the local stores use, so a bad row can never break the app.
import { sanitizeCompleted, sanitizeSettings } from "../progress";
import { sanitizeRecord, type WordRecord } from "../review/scheduler";
import { parseStore as parseFormality } from "../formality/storage";
import { sanitize as sanitizeWrite } from "../write/storage";
import { parseHistory as parseSpeak } from "../speak/history";
import { parseStoredPlacement } from "../placement/apply";
import { parseOnboarding } from "../onboarding/storage";
import { isDayKey, SETTING_KEYS, type FeaturesDoc, type ProgressCore, type SettingStamps, type SettingsDoc } from "./merge";

/** Document format written by this app version (the rows' schema_version). */
export const SCHEMA_VERSION = 1;
/** Client-side cap per document (the database refuses more than 512 KB of JSON text). */
export const MAX_DOC_BYTES = 450_000;

/** JSON with object keys sorted, so equal values always compare equal as strings. */
export function stableStringify(v: unknown): string {
  return JSON.stringify(sortKeys(v));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = sortKeys(x);
    }
    return out;
  }
  return v;
}

export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);

// --- user_progress -----------------------------------------------------------------------------

export function parseProgressDoc(data: unknown): ProgressCore | null {
  if (!isObj(data)) return null;
  const daily: Record<string, number> = {};
  if (isObj(data.daily)) for (const [k, v] of Object.entries(data.daily)) if (isDayKey(k) && num(v) >= 0) daily[k] = num(v);
  return {
    xp: Math.max(0, num(data.xp)),
    streak: Math.max(0, Math.floor(num(data.streak))),
    lastActiveDate: isDayKey(data.lastActiveDate) ? data.lastActiveDate : null,
    completed: sanitizeCompleted(data.completed),
    daily,
  };
}

// --- user_memory -------------------------------------------------------------------------------
// Compact form: { v: 1, w: { [id]: [reps, lapses, stability, difficulty, due, lastSeen, run, lastWrong?] } }
// (about half the size of the local form, which keeps a full lexicon well under the row cap).

type CompactWord = [number, number, number, number, number, number, number] | [number, number, number, number, number, number, number, number];

export function encodeWords(words: Record<string, WordRecord>): { v: 1; w: Record<string, CompactWord> } {
  const w: Record<string, CompactWord> = {};
  for (const [id, r] of Object.entries(words)) {
    const base: CompactWord = [r.reps, r.lapses, r.stability, r.difficulty, r.due, r.lastSeen, r.run];
    w[id] = r.lastWrong !== undefined ? ([...base, r.lastWrong] as CompactWord) : base;
  }
  return { v: 1, w };
}

export function parseMemoryDoc(data: unknown): Record<string, WordRecord> | null {
  if (!isObj(data) || data.v !== 1 || !isObj(data.w)) return null;
  const words: Record<string, WordRecord> = {};
  for (const [id, a] of Object.entries(data.w)) {
    if (!Array.isArray(a) || a.length < 7) continue;
    const rec = sanitizeRecord(
      {
        id,
        reps: a[0],
        lapses: a[1],
        stability: a[2],
        difficulty: a[3],
        due: a[4],
        lastSeen: a[5],
        run: a[6],
        ...(a.length > 7 && a[7] !== null ? { lastWrong: a[7] } : {}),
      },
      id,
    );
    if (rec) words[id] = rec;
  }
  return words;
}

// --- user_settings -----------------------------------------------------------------------------

export function sanitizeStamps(v: unknown): SettingStamps {
  const out: SettingStamps = {};
  if (!isObj(v)) return out;
  for (const k of SETTING_KEYS) {
    const t = num(v[k]);
    if (t > 0) out[k] = t;
  }
  return out;
}

export function parseSettingsDoc(data: unknown): SettingsDoc | null {
  if (!isObj(data)) return null;
  return {
    settings: sanitizeSettings(data.settings),
    stamps: sanitizeStamps(data.stamps),
    onboarding: data.onboarding ? parseOnboarding(JSON.stringify(data.onboarding)) : null,
  };
}

// --- user_features -----------------------------------------------------------------------------

export function parseFeaturesDoc(data: unknown): FeaturesDoc | null {
  if (!isObj(data)) return null;
  return {
    formality: isObj(data.formality) ? parseFormality(JSON.stringify(data.formality)) : null,
    write: isObj(data.write) ? sanitizeWrite(data.write) : null,
    speak: isObj(data.speak) ? parseSpeak(JSON.stringify({ items: data.speak })) : null,
    placement: isObj(data.placement) ? parseStoredPlacement(JSON.stringify(data.placement)) : null,
  };
}
