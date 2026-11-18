// Export (CSV + JSON) and import of reviewer state. Pure.
import { parseState, type ReviewState } from "./storage";

export const CSV_COLUMNS = ["reviewer", "date", "lessonId", "exerciseId", "verdict", "correction", "comment", "bengali"] as const;
export type CsvRow = Record<(typeof CSV_COLUMNS)[number], string>;

export const JSON_FORMAT = "banglalingo-review";

/**
 * One row per reviewed item, lesson by lesson. exerciseId is an exercise id, "tip", "vocab:<id>" or "lesson"
 * (the overall rating: verdict "rating:4"). Unknown lessons sort after the known ones, alphabetically.
 */
export function buildRows(state: ReviewState, lessonOrder: readonly string[] = []): CsvRow[] {
  const rank = new Map(lessonOrder.map((id, i) => [id, i]));
  const ids = Object.keys(state.lessons).sort(
    (a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity) || a.localeCompare(b),
  );
  const rows: CsvRow[] = [];
  for (const lessonId of ids) {
    const l = state.lessons[lessonId];
    if (l.overall) {
      rows.push({
        reviewer: state.reviewer,
        date: l.overall.updated,
        lessonId,
        exerciseId: "lesson",
        verdict: l.overall.rating !== undefined ? `rating:${l.overall.rating}` : "",
        correction: "",
        comment: l.overall.comment,
        bengali: "",
      });
    }
    const items = Object.entries(l.items).sort(([ka, a], [kb, b]) => a.seq - b.seq || ka.localeCompare(kb));
    for (const [key, it] of items) {
      rows.push({
        reviewer: state.reviewer,
        date: it.updated,
        lessonId,
        exerciseId: key,
        verdict: it.verdict ?? "",
        correction: it.correction,
        comment: it.comment,
        bengali: it.text,
      });
    }
  }
  return rows;
}

/** RFC 4180 field: quoted when it has a comma, quote, CR or LF; quotes doubled. */
export function csvEscape(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV text with a UTF-8 BOM (so spreadsheets read Bengali correctly) and CRLF line ends. */
export function toCsv(rows: readonly CsvRow[]): string {
  const lines = [CSV_COLUMNS.join(","), ...rows.map((r) => CSV_COLUMNS.map((c) => csvEscape(r[c])).join(","))];
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Parses CSV text (BOM, CRLF/LF, quoted fields with embedded commas, quotes and newlines) into rows of fields. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function toJsonExport(state: ReviewState, now: string = new Date().toISOString()): string {
  return JSON.stringify({ format: JSON_FORMAT, version: 1, exportedAt: now, reviewer: state.reviewer, lessons: state.lessons }, null, 2);
}

export type ImportResult = { ok: true; state: ReviewState } | { ok: false; error: string };

/** Reads a JSON export. Anything that is not one is rejected with a message; valid parts are kept. */
export function parseImport(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return { ok: false, error: "That file is not valid JSON. Import the .json file made by Export." };
  }
  const d = data as { format?: unknown; lessons?: unknown } | null;
  if (!d || typeof d !== "object" || d.format !== JSON_FORMAT || !d.lessons || typeof d.lessons !== "object") {
    return { ok: false, error: "That file is not a BanglaLingo review export." };
  }
  return { ok: true, state: parseState(data) };
}

/** banglalingo-review-<name>-<YYYY-MM-DD>.<ext>; the name keeps only ASCII letters and digits. */
export function exportFileName(reviewer: string, ext: "csv" | "json", now: Date = new Date()): string {
  const slug = reviewer.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "reviewer";
  return `banglalingo-review-${slug}-${now.toISOString().slice(0, 10)}.${ext}`;
}
