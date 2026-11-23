import { afterEach, describe, expect, it, vi } from "vitest";

// Beta deployment settings: indexing is blocked unless NEXT_PUBLIC_ALLOW_INDEXING=1.
async function load() {
  vi.resetModules();
  const robots = (await import("@/app/robots")).default;
  const { SITE_ROBOTS } = await import("@/lib/indexing");
  return { rules: robots().rules, SITE_ROBOTS };
}

afterEach(() => vi.unstubAllEnvs());

describe("indexing flag", () => {
  it("blocks everything by default", async () => {
    vi.stubEnv("NEXT_PUBLIC_ALLOW_INDEXING", "");
    const { rules, SITE_ROBOTS } = await load();
    expect(rules).toEqual({ userAgent: "*", disallow: "/" });
    expect(SITE_ROBOTS).toEqual({ index: false, follow: false });
  });

  it("only the exact value 1 opens it up, and the reviewer stays blocked", async () => {
    vi.stubEnv("NEXT_PUBLIC_ALLOW_INDEXING", "true");
    expect((await load()).rules).toEqual({ userAgent: "*", disallow: "/" });
    vi.stubEnv("NEXT_PUBLIC_ALLOW_INDEXING", "1");
    const { rules, SITE_ROBOTS } = await load();
    expect(SITE_ROBOTS).toBeUndefined();
    expect(JSON.stringify(rules)).toContain("/reviewer");
    expect(JSON.stringify(rules)).toContain('"allow":"/"');
  });
});

// Files read with fs at request time must be listed for the file tracer, or a serverless
// deployment silently loses them.
describe("outputFileTracingIncludes", () => {
  it("lists every content folder the app reads at run time, and each folder has JSON", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cfg = (await import("../next.config")).default;
    const globs = cfg.outputFileTracingIncludes?.["/*"] ?? [];
    for (const g of ["../content/stories/**/*.json", "../content/family/**/*.json", "../content/lexicon/**/*.json"]) {
      expect(globs).toContain(g);
      const dir = path.resolve(process.cwd(), g.replace(/\/\*\*\/\*\.json$/, ""));
      expect(fs.readdirSync(dir).some((f) => f.endsWith(".json")), dir).toBe(true);
    }
  });
});
