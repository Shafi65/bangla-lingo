// Browser-only glyph rendering for the guide: draws a letter from the self-hosted Bengali font.
// The same layout is used for the visible guide and for the offscreen scoring mask, so the two
// always agree.

import { MASK_SIZE, maskFromAlpha, type Mask } from "./scoring";

export const GUIDE_FONT_FAMILY = '"Noto Sans Bengali Variable", "Noto Sans Bengali", "Hind Siliguri", sans-serif';
const GUIDE_WEIGHT = 600;

/** Makes sure the font's Bengali subset is loaded before drawing. Never rejects. */
export async function ensureGuideFont(text: string): Promise<void> {
  try {
    await document.fonts.load(`${GUIDE_WEIGHT} 64px ${GUIDE_FONT_FAMILY}`, text);
  } catch {
    // draw with whatever font the browser has
  }
}

/** Marks and vowel signs that cannot stand alone: browsers draw a dotted circle when they are shaped bare. */
const COMBINING = /^[\u0981-\u0983\u09BC\u09BE-\u09CD\u09D7]/;
const BASE = "\u0995"; // ক

const shiftCache = new Map<string, number>();

/**
 * Signs drawn before the base (ি ে ৈ ো ৌ) push the base letter to the right. Find by how much (as a
 * share of the canvas width) by trying shifts and keeping the one that rubs out the most ink.
 */
function baseShift(text: string): number {
  if (!/[\u09BF\u09C7\u09C8\u09CB\u09CC]/.test(text)) return 0;
  const hit = shiftCache.get(text);
  if (hit !== undefined) return hit;
  const t = 240;
  const alpha = (str: string) => {
    const c = document.createElement("canvas");
    c.width = t;
    c.height = t;
    const x = c.getContext("2d", { willReadFrequently: true })!;
    x.font = `${GUIDE_WEIGHT} ${t * 0.5}px ${GUIDE_FONT_FAMILY}`;
    x.fillText(str, t * 0.3, t * 0.7);
    return x.getImageData(0, 0, t, t).data;
  };
  const both = alpha(BASE + text);
  const base = alpha(BASE);
  let best = 0;
  let bestLeft = Infinity;
  for (let dx = 0; dx < t * 0.45; dx++) {
    let left = 0;
    for (let y = 0; y < t; y++) {
      for (let x = 0; x < t; x++) {
        if (both[(y * t + x) * 4 + 3] < 40) continue;
        const bx = x - dx;
        if (bx < 0 || base[(y * t + bx) * 4 + 3] < 40) left++;
      }
    }
    if (left < bestLeft) {
      bestLeft = left;
      best = dx;
    }
  }
  const r = best / t;
  shiftCache.set(text, r);
  return r;
}

/**
 * A combining mark without the dotted circle: shape it on a base letter, rub the base out again,
 * then place what is left (the mark alone) in the middle of the area.
 */
function drawMark(ctx: CanvasRenderingContext2D, text: string, size: number) {
  const t = Math.round(size * 2);
  const tmp = document.createElement("canvas");
  tmp.width = t;
  tmp.height = t;
  const tc = tmp.getContext("2d", { willReadFrequently: true });
  if (!tc) return;
  tc.fillStyle = ctx.fillStyle;
  tc.font = `${GUIDE_WEIGHT} ${t * 0.5}px ${GUIDE_FONT_FAMILY}`;
  tc.textBaseline = "alphabetic";
  const x = t * 0.3;
  const y = t * 0.7;
  tc.fillText(BASE + text, x, y);
  tc.globalCompositeOperation = "destination-out";
  tc.fillText(BASE, x + baseShift(text) * t, y);
  const img = tc.getImageData(0, 0, t, t);
  const { data } = img;
  // Drop the faint anti-aliasing fringe left where the base was rubbed out.
  for (let i = 3; i < data.length; i += 4) if (data[i] < 110) data[i] = 0;
  tc.putImageData(img, 0, 0);
  let x0 = t, y0 = t, x1 = -1, y1 = -1;
  for (let j = 0; j < t; j++) {
    for (let i = 0; i < t; i++) {
      if (data[(j * t + i) * 4 + 3] < 40) continue;
      if (i < x0) x0 = i;
      if (i > x1) x1 = i;
      if (j < y0) y0 = j;
      if (j > y1) y1 = j;
    }
  }
  if (x1 < 0) return;
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const k = Math.min((size * 0.55) / Math.max(bw, bh), 1.1);
  ctx.drawImage(tmp, x0, y0, bw, bh, (size - bw * k) / 2, (size - bh * k) / 2, bw * k, bh * k);
}

/** Draw `text` centred in a size x size area, using the current fillStyle. */
export function drawGlyph(ctx: CanvasRenderingContext2D, text: string, size: number) {
  if (COMBINING.test(text.normalize("NFC"))) return drawMark(ctx, text, size);
  const base = size * 0.62;
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = `${GUIDE_WEIGHT} ${base}px ${GUIDE_FONT_FAMILY}`;
  const m = ctx.measureText(text);
  const w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  const h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  const maxDim = Math.max(w, h, 1);
  // Small marks are enlarged so there is something to trace; oversized shapes shrink to fit.
  const factor = Math.max(0.5, Math.min(2.2, (size * 0.6) / maxDim));
  const font = base * factor;
  ctx.font = `${GUIDE_WEIGHT} ${font}px ${GUIDE_FONT_FAMILY}`;
  const m2 = ctx.measureText(text);
  const w2 = m2.actualBoundingBoxLeft + m2.actualBoundingBoxRight;
  const h2 = m2.actualBoundingBoxAscent + m2.actualBoundingBoxDescent;
  const x = (size - w2) / 2 + m2.actualBoundingBoxLeft;
  const y = (size - h2) / 2 + m2.actualBoundingBoxAscent;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** The glyph's ink as a mask (offscreen canvas at MASK_SIZE). */
export function renderGlyphMask(text: string, size = MASK_SIZE): Mask {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { w: size, h: size, data: new Uint8Array(size * size) };
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#000";
  drawGlyph(ctx, text, size);
  return maskFromAlpha(ctx.getImageData(0, 0, size, size).data, size, size);
}
