import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AUDIO_CACHE, PRECACHE_MANIFEST_URL, SHELL_PREFIX, shellCacheName } from "@/lib/offline/cache-names";

// public/sw.js is plain script (served as-is); it exposes its pure helpers via module.exports for tests.
const sw = createRequire(import.meta.url)(path.resolve(import.meta.dirname, "..", "public", "sw.js")) as {
  AUDIO_CACHE: string;
  SHELL_PREFIX: string;
  MANIFEST_URL: string;
  versionFromUrl: (u: string) => string;
  shellCacheName: (v: string) => string;
  isStaleCache: (name: string, current: string) => boolean;
  pageKey: (u: string) => string;
  classify: (m: string, u: string, mode: string, h: { get(n: string): string | null }, origin: string) => string;
  extractStaticUrls: (t: string) => string[];
  extractLinkedFiles: (t: string) => string[];
  parseRange: (h: string, size: number) => { start: number; end: number } | null;
};

const ORIGIN = "https://app.example";
const headers = (o: Record<string, string> = {}) => ({ get: (n: string) => o[n.toLowerCase()] ?? null });
const cls = (url: string, o: { method?: string; mode?: string; h?: Record<string, string> } = {}) =>
  sw.classify(o.method ?? "GET", url, o.mode ?? "no-cors", headers(o.h), ORIGIN);

describe("service worker naming matches the app", () => {
  it("uses the same constants as src/lib/offline/cache-names.ts", () => {
    expect(sw.AUDIO_CACHE).toBe(AUDIO_CACHE);
    expect(sw.SHELL_PREFIX).toBe(SHELL_PREFIX);
    expect(sw.MANIFEST_URL).toBe(PRECACHE_MANIFEST_URL);
    expect(sw.shellCacheName("abc")).toBe(shellCacheName("abc"));
  });
  it("reads the build id from the script URL", () => {
    expect(sw.versionFromUrl(`${ORIGIN}/sw.js?b=Xy_9-z`)).toBe("Xy_9-z");
    expect(sw.versionFromUrl(`${ORIGIN}/sw.js`)).toBe("dev");
    expect(sw.versionFromUrl(`${ORIGIN}/sw.js?b=../..`)).toBe("dev");
  });
});

describe("old cache cleanup", () => {
  const cur = sw.shellCacheName("new");
  it("deletes our old shell caches but never the current one, the audio store or foreign caches", () => {
    expect(sw.isStaleCache(sw.shellCacheName("old"), cur)).toBe(true);
    expect(sw.isStaleCache(cur, cur)).toBe(false);
    expect(sw.isStaleCache(AUDIO_CACHE, cur)).toBe(false);
    expect(sw.isStaleCache("other-app-cache", cur)).toBe(false);
  });
});

describe("request classification", () => {
  it("never touches non-GET or cross-origin requests", () => {
    expect(cls(`${ORIGIN}/lesson/u01-l01`, { method: "POST" })).toBe("skip");
    expect(cls("https://cdn.example/x.js")).toBe("skip");
    expect(cls("chrome-extension://abc/x.js")).toBe("skip");
  });
  it("skips the worker script, the precache manifest and APIs", () => {
    expect(cls(`${ORIGIN}/sw.js?b=1`)).toBe("skip");
    expect(cls(`${ORIGIN}/offline/precache.json`)).toBe("skip");
    expect(cls(`${ORIGIN}/api/x`)).toBe("skip");
  });
  it("routes pages, RSC payloads, hashed assets and audio", () => {
    expect(cls(`${ORIGIN}/lesson/u01-l01`, { mode: "navigate" })).toBe("nav");
    expect(cls(`${ORIGIN}/lesson/u01-l01?_rsc=abc`, { h: { rsc: "1" } })).toBe("rsc");
    expect(cls(`${ORIGIN}/words?_rsc=abc`)).toBe("rsc");
    expect(cls(`${ORIGIN}/_next/static/chunks/a.js`)).toBe("static");
    expect(cls(`${ORIGIN}/audio/abc.mp3`)).toBe("audio");
    expect(cls(`${ORIGIN}/icons/icon-192.png`)).toBe("other");
  });
});

describe("page cache keys", () => {
  it("ignore query, hash and trailing slash", () => {
    expect(sw.pageKey(`${ORIGIN}/words/?x=1#y`)).toBe(`${ORIGIN}/words`);
    expect(sw.pageKey(`${ORIGIN}/`)).toBe(`${ORIGIN}/`);
    expect(sw.pageKey(`${ORIGIN}/?utm=1`)).toBe(`${ORIGIN}/`);
  });
});

describe("asset discovery in HTML", () => {
  it("finds hashed build files, including escaped ones in flight data", () => {
    const html = `<script src="/_next/static/chunks/a1.js"></script><link href="/_next/static/media/f.woff2" as="font"/>
      <script>self.__next_f.push(["\\"/_next/static/chunks/b2.js\\""])</script>`;
    expect(sw.extractStaticUrls(html)).toEqual([
      "/_next/static/chunks/a1.js",
      "/_next/static/media/f.woff2",
      "/_next/static/chunks/b2.js",
    ]);
  });
  it("finds icon and manifest links only", () => {
    const html = `<link rel="manifest" href="/manifest.webmanifest"/><link rel="icon" href="/icon.png?x=1"/><link rel="stylesheet" href="/_next/static/a.css"/><link rel="x" href="//evil.example/a.png"/>`;
    expect(sw.extractLinkedFiles(html)).toEqual(["/manifest.webmanifest", "/icon.png?x=1"]);
  });
});

describe("audio Range support", () => {
  it("parses byte ranges", () => {
    expect(sw.parseRange("bytes=0-", 100)).toEqual({ start: 0, end: 99 });
    expect(sw.parseRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 });
    expect(sw.parseRange("bytes=90-500", 100)).toEqual({ start: 90, end: 99 });
    expect(sw.parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(sw.parseRange("bytes=100-", 100)).toBeNull();
    expect(sw.parseRange("bytes=5-2", 100)).toBeNull();
    expect(sw.parseRange("items=0-1", 100)).toBeNull();
  });
});
