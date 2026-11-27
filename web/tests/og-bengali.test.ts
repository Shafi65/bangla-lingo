import fs from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { ImageResponse } from "next/og";
import { describe, expect, it } from "vitest";
import { bengaliSvg, fontsourceFile, woffToSfnt } from "@/lib/og/bengali-svg";
import { fitBengali, WORD_MAX_WIDTH } from "@/lib/og/word-card";
import { getWordPages } from "@/lib/wordpages/data";

describe("woffToSfnt", () => {
  it("unpacks the Noto Sans Bengali WOFF into a valid sfnt", () => {
    const woff = fs.readFileSync(fontsourceFile("@fontsource/noto-sans-bengali", "noto-sans-bengali-bengali-700-normal.woff"));
    const sfnt = Buffer.from(woffToSfnt(woff));
    expect(sfnt.readUInt32BE(0)).toBe(0x00010000); // TrueType outlines
    const count = sfnt.readUInt16BE(4);
    const tags = Array.from({ length: count }, (_, i) => sfnt.toString("latin1", 12 + i * 16, 16 + i * 16));
    expect(tags).toEqual(expect.arrayContaining(["GSUB", "GPOS", "glyf", "cmap"]));
  });
  it("rejects anything that is not WOFF 1.0", () => {
    expect(() => woffToSfnt(new Uint8Array(64))).toThrow(/WOFF/);
  });
});

describe("bengaliSvg", () => {
  it("shapes conjuncts: ক্ষ is one glyph, not ক + ্ + ষ", () => {
    const joined = bengaliSvg("ক্ষ", { size: 100, color: "#000" });
    const parts = bengaliSvg("কষ", { size: 100, color: "#000" });
    expect(joined.svg.match(/<path /g)).toHaveLength(1);
    expect(parts.svg.match(/<path /g)).toHaveLength(2);
  });
  it("puts ি before its consonant (pre-base reordering)", () => {
    // In কি the first glyph drawn (x = 0) must be the vowel sign, so it differs from ক's own outline.
    const ki = bengaliSvg("কি", { size: 100, color: "#000" }).svg;
    const ka = bengaliSvg("ক", { size: 100, color: "#000" }).svg;
    const firstPath = (s: string) => s.match(/<path transform="translate\(0 0\)" d="([^"]+)"/)?.[1];
    expect(firstPath(ki)).toBeTruthy();
    expect(firstPath(ki)).not.toBe(firstPath(ka));
  });
  it("returns a sized data URI and escapes the label", () => {
    const r = bengaliSvg("ধন্যবাদ", { size: 120, color: "#006a4e" });
    expect(r.src.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(r.width).toBeGreaterThan(200);
    expect(r.height).toBe(Math.round((1.55 * 120 * 1000) / 1000));
    expect(bengaliSvg('a"<b', { size: 10, color: "#000" }).svg).toContain("&#34;&#60;b");
  });

  it("renders correctly inside next/og (writes a preview PNG for eyeballing)", async () => {
    const words = ["কিছু ক্ষমা", "ধন্যবাদ বিশ্ববিদ্যালয়", "র\u200D্যাব কোথায়"];
    const imgs = words.map((w) => {
      const s = bengaliSvg(w, { size: 110, color: "#0d1614" });
      return h("img", { key: w, src: s.src, width: s.width, height: s.height });
    });
    const res = new ImageResponse(
      h("div", { style: { display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#fff", padding: 40 } }, imgs),
      { width: 1200, height: 630 },
    );
    const png = Buffer.from(await res.arrayBuffer());
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    const out = path.join("node_modules", ".cache", "og-bengali-preview.png");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, png);
  });
});

describe("share cards", () => {
  it("fit every word page's Bengali on the card", () => {
    const tooWide = getWordPages().filter((p) => fitBengali(p.bn, WORD_MAX_WIDTH).width > WORD_MAX_WIDTH);
    expect(tooWide.map((p) => p.bn)).toEqual([]);
  });
});
