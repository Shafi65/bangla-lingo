// Server-only: draw Bengali text as an SVG image for share cards (next/og).
//
// next/og (Satori) lays text out without OpenType shaping, so Bengali comes out wrong: ি is drawn
// after its consonant, conjuncts fall apart into bare hasantas, and ো splits in two. Here the text is
// shaped with HarfBuzz (harfbuzzjs, MIT), the same engine browsers use, and each shaped glyph's outline
// becomes an SVG path. The card then shows the SVG as an <img>.
import "server-only";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import * as hb from "harfbuzzjs";

/**
 * WOFF 1.0 -> plain sfnt (TTF/OTF). HarfBuzz reads only raw sfnt data; the Fontsource packages ship
 * WOFF. Each table is zlib-compressed in WOFF (or stored as-is when compression didn't help).
 */
export function woffToSfnt(woff: Uint8Array): Uint8Array {
  const src = Buffer.from(woff.buffer, woff.byteOffset, woff.byteLength);
  if (src.readUInt32BE(0) !== 0x774f4646) throw new Error("not a WOFF 1.0 file"); // "wOFF"
  const flavor = src.readUInt32BE(4);
  const count = src.readUInt16BE(12);
  const tables = Array.from({ length: count }, (_, i) => {
    const o = 44 + i * 20;
    const tag = src.readUInt32BE(o);
    const offset = src.readUInt32BE(o + 4);
    const compLength = src.readUInt32BE(o + 8);
    const origLength = src.readUInt32BE(o + 12);
    const checksum = src.readUInt32BE(o + 16);
    const raw = src.subarray(offset, offset + compLength);
    const data = compLength < origLength ? zlib.inflateSync(raw) : raw;
    if (data.length !== origLength) throw new Error("corrupt WOFF table");
    return { tag, checksum, data };
  });
  const headerSize = 12 + 16 * count;
  const out = Buffer.alloc(headerSize + tables.reduce((n, t) => n + ((t.data.length + 3) & ~3), 0));
  let pow2 = 1;
  let log2 = 0;
  while (pow2 * 2 <= count) {
    pow2 *= 2;
    log2++;
  }
  out.writeUInt32BE(flavor, 0);
  out.writeUInt16BE(count, 4);
  out.writeUInt16BE(pow2 * 16, 6);
  out.writeUInt16BE(log2, 8);
  out.writeUInt16BE(count * 16 - pow2 * 16, 10);
  let offset = headerSize;
  tables.forEach((t, i) => {
    const o = 12 + i * 16;
    out.writeUInt32BE(t.tag, o);
    out.writeUInt32BE(t.checksum, o + 4);
    out.writeUInt32BE(offset, o + 8);
    out.writeUInt32BE(t.data.length, o + 12);
    t.data.copy(out, offset);
    offset += (t.data.length + 3) & ~3;
  });
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

/**
 * Path of a Fontsource WOFF file (OFL-1.1) in web/node_modules. Builds, tests and the server all run
 * from web/; the files are listed in next.config.ts outputFileTracingIncludes for deployments.
 */
export function fontsourceFile(pkg: string, file: string): string {
  return path.join(process.cwd(), "node_modules", pkg, "files", file);
}

let font: { font: hb.Font; upem: number } | undefined;

function bengaliFont() {
  if (font) return font;
  const woff = fs.readFileSync(fontsourceFile("@fontsource/noto-sans-bengali", "noto-sans-bengali-bengali-700-normal.woff"));
  const face = new hb.Face(new hb.Blob(woffToSfnt(woff).buffer as ArrayBuffer));
  return (font = { font: new hb.Font(face), upem: face.upem });
}

export interface SvgText {
  /** data: URI for an <img>. */
  src: string;
  width: number;
  height: number;
  /** The raw SVG (for tests). */
  svg: string;
}

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Shape `text` (Bengali, bold Noto Sans Bengali) and return it as an SVG image `size` px tall per em.
 * The box covers the font's full ascent and descent so vowel signs above and below are never clipped.
 */
export function bengaliSvg(text: string, { size, color }: { size: number; color: string }): SvgText {
  const { font: f, upem } = bengaliFont();
  const buf = new hb.Buffer();
  buf.addText(text);
  buf.guessSegmentProperties();
  hb.shape(f, buf);
  const infos = buf.getGlyphInfos();
  const positions = buf.getGlyphPositions();
  let x = 0;
  const paths: string[] = [];
  infos.forEach((g, i) => {
    const p = positions[i];
    const d = f.glyphToPath(g.codepoint);
    if (d) paths.push(`<path transform="translate(${x + p.xOffset} ${p.yOffset})" d="${d}"/>`);
    x += p.xAdvance;
  });
  // Noto Sans Bengali reaches about 1.07 em above the baseline (reph, ঁ) and 0.4 em below (ু, ৃ).
  const ascent = Math.round(upem * 1.1);
  const descent = Math.round(upem * 0.45);
  const w = Math.max(1, x);
  const h = ascent + descent;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${-ascent} ${w} ${h}" role="img" aria-label="${esc(text)}">` +
    `<g fill="${esc(color)}" transform="scale(1 -1)">${paths.join("")}</g></svg>`;
  return {
    svg,
    src: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    width: Math.round((w * size) / upem),
    height: Math.round((h * size) / upem),
  };
}
