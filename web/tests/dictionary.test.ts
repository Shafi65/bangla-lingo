import { describe, expect, it } from "vitest";
import { getDictionary } from "@/lib/dictionary/data";
import { getTranslateData } from "@/lib/translate/data";
import { getReviewWords } from "@/lib/review/catalog";

// Words from content/lexicon/family-extra.json are taught by no lesson (they belong to /family).
describe("untaught family words", () => {
  const dict = getDictionary();
  const extra = dict.entries.filter((e) => !e.l);

  it("have no lesson link and sit outside every unit filter", () => {
    expect(extra.length).toBeGreaterThan(0);
    for (const e of extra) expect(e.u).toBe(-1);
    for (const e of dict.entries.filter((x) => x.l)) {
      expect(e.u).toBeGreaterThanOrEqual(0);
      expect(dict.lessons[e.l!]).toBeDefined();
    }
  });

  it("never reach translate links or the review catalog", () => {
    const t = getTranslateData();
    const bn = new Set(extra.map((e) => e.bn));
    for (const i of t.items) if (bn.has(i.bn) && i.l) expect(t.lessons[i.l]).toBeDefined();
    const ids = new Set(getReviewWords().map((w) => w.id));
    for (const e of extra) expect(ids.has(e.id)).toBe(false);
  });
});
