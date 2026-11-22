// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CACHE_KEY, CACHE_MAX, CACHE_TTL_MS, cacheClear, cacheGet, cacheKey, cacheSet } from "@/lib/translate/cache";
import { requestMachine } from "@/lib/translate/client";

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("client result cache", () => {
  it("uses the documented storage key", () => {
    expect(CACHE_KEY).toBe("banglalingo.translate.cache.v1");
  });

  it("stores and returns a result, normalizing case and spacing of Latin text", () => {
    cacheSet(cacheKey("Thank   you", "en", "bn", false), { text: "ধন্যবাদ", roman: ["dhonnobad"] });
    expect(cacheGet(cacheKey(" thank you ", "en", "bn", false))).toEqual({ text: "ধন্যবাদ", roman: ["dhonnobad"] });
    expect(cacheGet(cacheKey("thank you", "en", "bn", true))).toBeNull(); // romanized is a different question
    expect(cacheGet(cacheKey("thank you", "bn", "en", false))).toBeNull();
  });

  it("keeps about 200 entries, dropping the least recently used", () => {
    const t0 = Date.now();
    for (let i = 0; i < CACHE_MAX + 5; i++) cacheSet(`k${i}`, { text: `v${i}` }, t0 + i);
    cacheGet("k5", t0 + 1000); // touched: now the newest
    cacheSet("extra", { text: "x" }, t0 + 2000);
    const stored = JSON.parse(localStorage.getItem(CACHE_KEY)!);
    expect(stored.e).toHaveLength(CACHE_MAX);
    expect(cacheGet("k0")).toBeNull();
    expect(cacheGet("k5")).toEqual({ text: "v5" });
    expect(cacheGet("extra")).toEqual({ text: "x" });
  });

  it("drops entries older than the lifetime", () => {
    cacheSet("old", { text: "x" }, 0);
    expect(cacheGet("old", CACHE_TTL_MS + 1)).toBeNull();
  });

  it("survives blocked, full or corrupt storage", () => {
    localStorage.setItem(CACHE_KEY, "{not json");
    expect(cacheGet("a")).toBeNull();
    localStorage.setItem(CACHE_KEY, JSON.stringify({ v: 2, e: [] }));
    expect(cacheGet("a")).toBeNull();
    localStorage.setItem(CACHE_KEY, JSON.stringify({ v: 1, e: [["a", { text: 5 }, 1], "junk"] }));
    expect(cacheGet("a")).toBeNull();

    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => cacheSet("b", { text: "x" })).not.toThrow();
    set.mockRestore();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(cacheGet("b")).toBeNull();
    expect(() => cacheClear()).not.toThrow();
  });

  it("a repeat lookup makes no request", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ ok: true, text: "ধন্যবাদ", from: "en", to: "bn", roman: ["dhonnobad"] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const first = await requestMachine("Thank you", "en", "bn");
    expect(first).toMatchObject({ s: "done", text: "ধন্যবাদ", roman: ["dhonnobad"] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const second = await requestMachine("thank you ", "en", "bn");
    expect(second).toMatchObject({ s: "done", text: "ধন্যবাদ", cached: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not cache failures, and sends the romanized flag", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ ok: false, quota: true, error: "The free translation allowance is used up for this month; course words still work." }, { status: 503 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await requestMachine("ami bhat khai", "bn", "en", { romanized: true });
    expect(r).toMatchObject({ s: "error", quota: true });
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({
      text: "ami bhat khai",
      from: "bn",
      to: "en",
      romanized: true,
    });
    await requestMachine("ami bhat khai", "bn", "en", { romanized: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
