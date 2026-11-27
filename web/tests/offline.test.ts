import { describe, expect, it } from "vitest";
import {
  buildAudioPacks,
  collectStrings,
  formatBytes,
  OTHER_PACK_ID,
  packProgress,
} from "@/lib/offline/audio-packs";
import { AUDIO_CACHE, SHELL_PREFIX, sanitizeBuildId, shellCacheName, swUrl } from "@/lib/offline/cache-names";
import { pageRoutesFromManifest, shellRoutes, STATIC_ROUTES } from "@/lib/offline/routes";

describe("shellRoutes", () => {
  it("lists the fixed pages, guide units and every lesson once", () => {
    const r = shellRoutes({ lessonIds: ["u01-l01", "u01-l02", "u01-l01"], guideUnitIds: ["u01-basics"] });
    expect(r[0]).toBe("/");
    for (const s of STATIC_ROUTES) expect(r).toContain(s);
    expect(r).toContain("/guide/u01-basics");
    expect(r.filter((x) => x === "/lesson/u01-l01")).toHaveLength(1);
    expect(r).toContain("/lesson/u01-l02");
    expect(new Set(r).size).toBe(r.length);
  });

  it("includes /offline, /practice, /words, /dictionary and /settings", () => {
    const r = shellRoutes({ lessonIds: [], guideUnitIds: [] });
    expect(r).toEqual(expect.arrayContaining(["/offline", "/practice", "/words", "/dictionary", "/settings", "/guide"]));
  });

  it("picks up extra built pages and keeps de-duplicated", () => {
    expect(shellRoutes({ lessonIds: [], guideUnitIds: [], extra: ["/welcome", "/words"] })).toContain("/welcome");
  });

  it("pageRoutesFromManifest keeps plain pages only", () => {
    expect(
      pageRoutesFromManifest(["/", "/words", "/lesson/[id]", "/icon.png", "/manifest.webmanifest", "/_not-found", "/offline/precache.json", "/guide", "/bengali", "/bengalix"]),
    ).toEqual(["/", "/words", "/guide", "/bengalix"]);
  });
});

describe("cache naming", () => {
  it("versions the shell cache by build id and sanitizes it", () => {
    expect(shellCacheName("abc_123-X")).toBe(`${SHELL_PREFIX}abc_123-X`);
    expect(sanitizeBuildId("a/b c?d")).toBe("abcd");
    expect(sanitizeBuildId("")).toBe("dev");
    expect(shellCacheName("one")).not.toBe(shellCacheName("two"));
  });
  it("registers a distinct script URL per build", () => {
    expect(swUrl("x1")).toBe("/sw.js?b=x1");
    expect(swUrl("x1")).not.toBe(swUrl("x2"));
  });
  it("audio cache is not versioned by build", () => {
    expect(AUDIO_CACHE).not.toContain("shell");
    expect(shellCacheName("a").startsWith(AUDIO_CACHE)).toBe(false);
  });
});

describe("audio packs", () => {
  const items = {
    "আমি": "a.mp3",
    "তুমি": "b.mp3",
    "ইফতার কখন?": "c.mp3",
    "ভাত": "d.mp3",
    "abbu (ব্ব, a held b)": "e.mp3",
    "ভাত খাই": "f.mp3",
  };
  const sizes: Record<string, number> = { "a.mp3": 1000, "b.mp3": 2000, "c.mp3": 3000, "d.mp3": 4000, "e.mp3": 500, "f.mp3": 1500 };
  const sizeOf = (f: string) => sizes[f] ?? 0;

  it("collectStrings walks nested lesson data and joins string arrays", () => {
    const s = collectStrings({ a: { bn: "আমি" }, tiles: ["ভাত", "খাই"], n: 3, deep: [{ x: "তুমি" }] });
    expect(s.has("আমি")).toBe(true);
    expect(s.has("ভাত খাই")).toBe(true);
    expect(s.has("তুমি")).toBe(true);
  });

  it("maps clips to units through the lesson text, with NFC + trim normalisation", () => {
    const data = buildAudioPacks(
      [
        { id: "u1", title: "Basics", texts: ["  আমি ", "something else"] },
        { id: "u2", title: "Food", texts: new Set(["ভাত", "ভাত খাই", "আমি"]) },
        { id: "u3", title: "Empty", texts: ["nothing"] },
      ],
      items,
      sizeOf,
    );
    const byId = Object.fromEntries(data.packs.map((p) => [p.id, p]));
    const files = (id: string) => byId[id].idx.map((i) => data.files[i]);
    expect(files("u1")).toEqual(["a.mp3"]);
    expect(files("u2")).toEqual(["a.mp3", "d.mp3", "f.mp3"]);
    expect(byId.u3).toBeUndefined();
    expect(byId.u2.bytes).toBe(1000 + 4000 + 1500);
  });

  it("puts clips no unit uses into an 'other' pack so all clips stay reachable", () => {
    const data = buildAudioPacks([{ id: "u1", title: "Basics", texts: ["আমি"] }], items, sizeOf);
    const other = data.packs.find((p) => p.id === OTHER_PACK_ID)!;
    expect(other.idx.map((i) => data.files[i])).toEqual(["b.mp3", "c.mp3", "d.mp3", "e.mp3", "f.mp3"]);
    const covered = new Set(data.packs.flatMap((p) => p.idx));
    expect(covered.size).toBe(data.files.length);
    expect(data.totalBytes).toBe(12000);
  });

  it("de-duplicates files shared by several keys", () => {
    const data = buildAudioPacks([], { x: "same.mp3", y: "same.mp3" }, () => 10);
    expect(data.files).toEqual(["same.mp3"]);
    expect(data.totalBytes).toBe(10);
  });

  it("reports pack progress against what is cached", () => {
    const data = buildAudioPacks([{ id: "u", title: "U", texts: ["আমি", "তুমি"] }], items, sizeOf);
    const pack = data.packs[0];
    expect(packProgress(data, pack.idx, new Set()).complete).toBe(false);
    const half = packProgress(data, pack.idx, new Set(["a.mp3"]));
    expect(half).toMatchObject({ have: 1, total: 2, haveBytes: 1000, complete: false });
    expect(packProgress(data, pack.idx, new Set(["a.mp3", "b.mp3"])).complete).toBe(true);
  });

  it("formats sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5.5 * 1024 * 1024)).toBe("5.5 MB");
    expect(formatBytes(28 * 1024 * 1024)).toBe("28 MB");
  });
});
