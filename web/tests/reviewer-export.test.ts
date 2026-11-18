import { describe, expect, it } from "vitest";
import {
  buildRows,
  CSV_COLUMNS,
  csvEscape,
  exportFileName,
  parseCsv,
  parseImport,
  toCsv,
  toJsonExport,
} from "@/lib/reviewer/export";
import { emptyState, mergeStates, setReviewer, updateItem, updateOverall } from "@/lib/reviewer/storage";

const T = "2026-11-18T10:00:00.000Z";

function sample() {
  let s = setReviewer(emptyState(), "Rina, \"R\" Ahmed");
  s = updateItem(s, "u01-l02", "e02", { hash: "h", text: "তুমি কেমন আছ?", seq: 3 }, { verdict: "needs_change", correction: "তুমি কেমন আছো?", comment: "Line one,\nline \"two\"" }, T);
  s = updateItem(s, "u01-l02", "tip", { hash: "h", text: "আপনি", seq: 1 }, { verdict: "ok" }, T);
  s = updateItem(s, "u01-l01", "vocab:ami", { hash: "h", text: "আমি", seq: 2 }, { verdict: "unsure", comment: "বাংলা মন্তব্য" }, T);
  s = updateOverall(s, "u01-l01", { rating: 4, comment: "natural, mostly" }, T);
  return s;
}

describe("reviewer export", () => {
  it("escapes commas, quotes, newlines", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("l1\nl2")).toBe('"l1\nl2"');
    expect(csvEscape("l1\r\nl2")).toBe('"l1\r\nl2"');
    expect(csvEscape("আমি, তুমি")).toBe('"আমি, তুমি"');
  });

  it("orders rows by course order, then lesson / tip / vocab / exercise position", () => {
    const rows = buildRows(sample(), ["u01-l01", "u01-l02"]);
    expect(rows.map((r) => `${r.lessonId}/${r.exerciseId}`)).toEqual([
      "u01-l01/lesson",
      "u01-l01/vocab:ami",
      "u01-l02/tip",
      "u01-l02/e02",
    ]);
    expect(rows[0]).toMatchObject({ verdict: "rating:4", comment: "natural, mostly", bengali: "" });
    expect(rows[3]).toMatchObject({ reviewer: 'Rina, "R" Ahmed', date: T, verdict: "needs_change", correction: "তুমি কেমন আছো?", bengali: "তুমি কেমন আছ?" });
  });

  it("writes a CSV that a parser reads back exactly (Bengali, commas, quotes, newlines)", () => {
    const rows = buildRows(sample(), ["u01-l01", "u01-l02"]);
    const csv = toCsv(rows);
    expect(csv.startsWith("﻿" + CSV_COLUMNS.join(","))).toBe(true);
    const parsed = parseCsv(csv);
    expect(parsed[0]).toEqual([...CSV_COLUMNS]);
    expect(parsed).toHaveLength(rows.length + 1);
    rows.forEach((r, i) => expect(parsed[i + 1]).toEqual(CSV_COLUMNS.map((c) => r[c])));
    expect(parsed[4][6]).toBe('Line one,\nline "two"');
    expect(parsed[2][6]).toBe("বাংলা মন্তব্য");
  });

  it("parseCsv handles LF-only input and a missing final newline", () => {
    expect(parseCsv('a,b\n"x,1",y')).toEqual([["a", "b"], ["x,1", "y"]]);
    expect(parseCsv("")).toEqual([]);
  });

  it("round-trips through the JSON export and import", () => {
    const s = sample();
    const json = toJsonExport(s, T);
    expect(JSON.parse(json)).toMatchObject({ format: "banglalingo-review", exportedAt: T });
    const res = parseImport(json);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.state).toEqual(s);
  });

  it("imports into another device's state, keeping newer local edits", () => {
    const remote = sample();
    let local = setReviewer(emptyState(), "");
    local = updateItem(local, "u01-l02", "e02", { hash: "h", text: "x", seq: 3 }, { verdict: "ok" }, "2026-11-19T10:00:00.000Z");
    const res = parseImport(toJsonExport(remote, T));
    if (!res.ok) throw new Error("import failed");
    const { state, taken } = mergeStates(local, res.state);
    expect(state.reviewer).toBe(remote.reviewer);
    expect(state.lessons["u01-l02"].items.e02.verdict).toBe("ok");
    expect(state.lessons["u01-l02"].items.tip.verdict).toBe("ok");
    expect(taken).toBe(3);
  });

  it("rejects files that are not a review export", () => {
    expect(parseImport("not json")).toMatchObject({ ok: false });
    expect(parseImport("{}")).toMatchObject({ ok: false });
    expect(parseImport(JSON.stringify({ format: "other", lessons: {} }))).toMatchObject({ ok: false });
    expect(parseImport("[]")).toMatchObject({ ok: false });
  });

  it("names files from an ASCII-safe slug", () => {
    const d = new Date("2026-11-18T10:00:00Z");
    expect(exportFileName("Rina Ahmed", "csv", d)).toBe("banglalingo-review-rina-ahmed-2026-11-18.csv");
    expect(exportFileName("রিনা", "json", d)).toBe("banglalingo-review-reviewer-2026-11-18.json");
  });
});
