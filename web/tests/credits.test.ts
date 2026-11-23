import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { getCredits } from "@/lib/credits/data";
import { creditLine, describePeople, type Licence } from "@/lib/credits/format";
import { checkSources, publicDomainProblems } from "../../content/scripts/sources.mjs";

const REAL_CONTENT = path.resolve(import.meta.dirname, "..", "..", "content");
const REGISTRY = JSON.parse(fs.readFileSync(path.join(REAL_CONTENT, "sources", "licences.json"), "utf8"));
const LICENCES = new Map<string, Licence>(REGISTRY.licences.map((l: Licence) => [l.id, l]));

const made: string[] = [];
afterAll(() => made.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

/** Throw-away content dir with the real licence registry plus the given library files. */
function tree(files: Record<string, unknown>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bl-sources-"));
  made.push(dir);
  const all = { "sources/licences.json": REGISTRY, ...files };
  for (const [f, d] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), JSON.stringify(d));
  }
  return dir;
}

const storyweaver = {
  id: "sw-the-red-kite",
  kind: "stories",
  source: {
    title: "The Red Kite",
    creators: [
      { name: "A. Writer", role: "author" },
      { name: "B. Artist", role: "illustrator" },
      { name: "C. Translator", role: "translator" },
    ],
    publisher: "Pratham Books",
    platform: "StoryWeaver",
    funder: "Some Foundation",
    url: "https://storyweaver.org.in/stories/1-the-red-kite",
    licence: "CC-BY-4.0",
    modified: true,
    changes: "Added word glosses, audio and questions.",
    variety: "in",
  },
};
const tuntuni = {
  id: "pd-tuntuni-1",
  kind: "stories",
  source: {
    title: "Tuntuni and the cat",
    creators: [{ name: "Upendrakishore Ray Chowdhury", role: "author" }],
    url: "https://bn.wikisource.org/wiki/example",
    licence: "public-domain",
    published: 1910,
    authorDied: 1915,
    modified: false,
    variety: "both",
  },
};

describe("credit lines", () => {
  it("names people by role in a fixed order", () => {
    expect(describePeople(storyweaver.source.creators as never)).toBe(
      "written by A. Writer, translated by C. Translator, illustrated by B. Artist",
    );
  });

  it("formats a StoryWeaver credit with publisher, platform, funder, licence and changes", () => {
    expect(creditLine(storyweaver.source as never, LICENCES)).toBe(
      "“The Red Kite”, written by A. Writer, translated by C. Translator, illustrated by B. Artist, " +
        "published by Pratham Books on StoryWeaver supported by Some Foundation. CC BY 4.0. " +
        "Changes: Added word glosses, audio and questions.",
    );
  });

  it("adds the year to public-domain titles", () => {
    expect(creditLine(tuntuni.source as never, LICENCES)).toBe(
      "“Tuntuni and the cat (1910)”, written by Upendrakishore Ray Chowdhury. Public domain.",
    );
  });
});

describe("licence checks (content/scripts/sources.mjs)", () => {
  const run = (files: Record<string, unknown>, year = 2026) => checkSources(tree(files), { year });

  it("passes the real content tree", () => {
    const r = checkSources(REAL_CONTENT);
    expect(r.errors).toEqual([]);
  });

  it("accepts well-formed CC BY and public-domain items", () => {
    const r = run({ "library/stories/sw-the-red-kite.json": storyweaver, "library/stories/pd-tuntuni-1.json": tuntuni });
    expect(r.errors).toEqual([]);
    expect(r.items).toBe(2);
  });

  it.each([
    ["CC-BY-NC-4.0", /non-commercial/],
    ["CC-BY-NC-ND-4.0", /non-commercial/],
    ["CC-BY-ND-4.0", /no-derivatives/],
    ["GPL-3.0", /copyleft/],
    ["made-up", /unknown licence/],
  ])("blocks licence %s", (licence, msg) => {
    const item = { ...storyweaver, source: { ...storyweaver.source, licence } };
    const r = run({ "library/stories/sw-the-red-kite.json": item });
    expect(r.errors.join("\n")).toMatch(msg);
  });

  it("requires creators, an https url and a note of changes for CC BY", () => {
    const item = {
      ...storyweaver,
      source: { ...storyweaver.source, creators: [], url: "http://example.org", changes: undefined },
    };
    const msgs = run({ "library/stories/sw-the-red-kite.json": item }).errors.join("\n");
    expect(msgs).toMatch(/needs creators/);
    expect(msgs).toMatch(/https:\/\//);
    expect(msgs).toMatch(/source\.changes/);
  });

  it("requires modified to be stated", () => {
    const item = { ...tuntuni, source: { ...tuntuni.source, modified: undefined } };
    expect(run({ "library/stories/pd-tuntuni-1.json": item }).errors.join("\n")).toMatch(/modified must be/);
  });

  it("rejects public-domain claims that fail the US or Bangladesh/India rule", () => {
    expect(publicDomainProblems({ published: 1930, authorDied: 1965 }, 2026)).toEqual([]);
    expect(publicDomainProblems({ published: 1931, authorDied: 1915 }, 2026).join()).toMatch(/US copyright/);
    expect(publicDomainProblems({ published: 1922, authorDied: 1976 }, 2026).join()).toMatch(/Bangladesh\/India/);
    // The cut-offs move each year: 1931 works become PD in the US in 2027.
    expect(publicDomainProblems({ published: 1931, authorDied: 1915 }, 2027)).toEqual([]);
    const nazrul = { ...tuntuni, source: { ...tuntuni.source, published: 1922, authorDied: 1976 } };
    expect(run({ "library/stories/pd-tuntuni-1.json": nazrul }).errors.join("\n")).toMatch(/Bangladesh\/India/);
  });

  it("checks ids, file names, duplicates and folders", () => {
    const r = run({
      "library/stories/wrong-name.json": storyweaver,
      "library/films/x.json": { id: "x" },
    });
    const msgs = r.errors.join("\n");
    expect(msgs).toMatch(/file name must be sw-the-red-kite\.json/);
    expect(msgs).toMatch(/unknown folder/);
  });

  it("warns when a story has no variety", () => {
    const item = { ...tuntuni, source: { ...tuntuni.source, variety: undefined } };
    expect(run({ "library/stories/pd-tuntuni-1.json": item }).warnings.join("\n")).toMatch(/variety/);
  });

  it("is a no-op for content trees without sources (older test fixtures)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bl-sources-"));
    made.push(dir);
    expect(checkSources(dir)).toEqual({ errors: [], warnings: [], items: 0 });
  });
});

describe("credits loader", () => {
  it("loads app credits from the real content tree", () => {
    const c = getCredits(REAL_CONTENT);
    expect(c.app.map((a) => a.id)).toContain("font-noto-sans-bengali");
    expect(c.licences.get("CC-BY-4.0")?.allowed).toBe(true);
  });

  it("only returns library items with allowed licences", () => {
    const blocked = { ...storyweaver, id: "sw-blocked", source: { ...storyweaver.source, licence: "CC-BY-NC-4.0" } };
    const dir = tree({
      "library/stories/sw-the-red-kite.json": storyweaver,
      "library/stories/sw-blocked.json": blocked,
    });
    expect(getCredits(dir).library.map((i) => i.id)).toEqual(["sw-the-red-kite"]);
  });
});
