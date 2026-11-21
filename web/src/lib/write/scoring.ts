// Handwriting scoring: pure functions over pixel masks (no DOM, no canvas, no clock).
//
// A mask is a square grid of 0/1 cells. The guide mask is the glyph's ink (rendered from the font);
// the ink mask is rasterised from the learner's strokes. Two shares are measured:
//   coverage  = share of the glyph's ink pixels that lie within `tolerance` of the learner's ink
//   precision = share of the learner's ink pixels that lie within `tolerance` of the glyph's ink
// (i.e. "inside the dilated glyph"). Both must clear their threshold. Coverage alone is beaten by
// scribbling everywhere; precision alone is beaten by drawing one dot on the glyph. Together they
// ask for a stroke set that follows the shape.
//
// All lengths are in mask pixels at MASK_SIZE (160), so they are independent of screen size.

export const MASK_SIZE = 160;

/** Learner brush radius in mask pixels (about 4.4% of the canvas wide). */
export const BRUSH_RADIUS = 3.5;

export interface Mask {
  w: number;
  h: number;
  /** 1 = ink. Row-major, length w*h. */
  data: Uint8Array;
}

/** A stroke point in normalised canvas coordinates (0..1 on both axes). */
export interface Point {
  x: number;
  y: number;
}
export type Stroke = Point[];

export interface ScoreParams {
  /** A guide pixel counts as covered when learner ink is within this many mask pixels. */
  coverageTolerance: number;
  /** A learner pixel counts as inside when the glyph is within this many mask pixels. */
  precisionTolerance: number;
  minCoverage: number;
  minPrecision: number;
  /** Move the learner's ink so its bounding-box centre sits on the glyph's (memory mode). */
  align: boolean;
  /** Largest alignment move, in mask pixels per axis. */
  maxShift: number;
}

export const TRACE_PARAMS: ScoreParams = {
  coverageTolerance: 5,
  precisionTolerance: 5,
  minCoverage: 0.8,
  minPrecision: 0.8,
  align: false,
  maxShift: 0,
};

export const MEMORY_PARAMS: ScoreParams = {
  coverageTolerance: 5,
  precisionTolerance: 6,
  minCoverage: 0.7,
  minPrecision: 0.75,
  align: true,
  maxShift: 20,
};

export type ScoreReason = "ok" | "empty" | "missed" | "stray" | "both";

export interface ScoreResult {
  /** Share of the glyph covered by the learner's strokes, 0..1. */
  coverage: number;
  /** Share of the learner's ink inside the dilated glyph, 0..1. */
  precision: number;
  passed: boolean;
  reason: ScoreReason;
  /** Alignment applied to the learner's ink, in mask pixels (0,0 unless `align`). */
  shift: { dx: number; dy: number };
}

export function createMask(w = MASK_SIZE, h = w): Mask {
  return { w, h, data: new Uint8Array(w * h) };
}

export function countInk(m: Mask): number {
  let n = 0;
  for (let i = 0; i < m.data.length; i++) n += m.data[i];
  return n;
}

/** Build a mask from RGBA pixels (e.g. canvas getImageData): ink where alpha >= threshold. */
export function maskFromAlpha(rgba: ArrayLike<number>, w: number, h: number, threshold = 96): Mask {
  const m = createMask(w, h);
  for (let i = 0; i < w * h; i++) m.data[i] = rgba[i * 4 + 3] >= threshold ? 1 : 0;
  return m;
}

function stampDisk(m: Mask, cx: number, cy: number, r: number) {
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(m.w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(m.h - 1, Math.ceil(cy + r));
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      if (dx * dx + dy * dy <= r2) m.data[y * m.w + x] = 1;
    }
  }
}

/** Rasterise strokes (normalised points) as round-capped lines of the given radius. */
export function rasterizeStrokes(strokes: readonly Stroke[], size = MASK_SIZE, radius = BRUSH_RADIUS): Mask {
  const m = createMask(size);
  for (const s of strokes) {
    if (s.length === 0) continue;
    if (s.length === 1) {
      stampDisk(m, s[0].x * size, s[0].y * size, radius);
      continue;
    }
    for (let i = 1; i < s.length; i++) {
      const ax = s[i - 1].x * size;
      const ay = s[i - 1].y * size;
      const bx = s[i].x * size;
      const by = s[i].y * size;
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (radius * 0.5)));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        stampDisk(m, ax + (bx - ax) * t, ay + (by - ay) * t, radius);
      }
    }
  }
  return m;
}

/** Dilate by a disc of radius r (mask pixels). Exact for the discrete disc; O(w*h*r). */
export function dilate(m: Mask, r: number): Mask {
  const { w, h } = m;
  const out = createMask(w, h);
  const ri = Math.floor(r);
  if (ri <= 0) {
    out.data.set(m.data);
    return out;
  }
  // Horizontal dilation for each distinct half-width, via row prefix sums.
  const halfWidths = new Map<number, Uint8Array>();
  const prefix = new Int32Array((w + 1) * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) prefix[y * (w + 1) + x + 1] = prefix[y * (w + 1) + x] + m.data[y * w + x];
  }
  const horizontal = (hw: number) => {
    let d = halfWidths.get(hw);
    if (d) return d;
    d = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const base = y * (w + 1);
      for (let x = 0; x < w; x++) {
        const lo = Math.max(0, x - hw);
        const hi = Math.min(w, x + hw + 1);
        d[y * w + x] = prefix[base + hi] - prefix[base + lo] > 0 ? 1 : 0;
      }
    }
    halfWidths.set(hw, d);
    return d;
  };
  for (let dy = -ri; dy <= ri; dy++) {
    const hw = Math.floor(Math.sqrt(r * r - dy * dy));
    const row = horizontal(hw);
    for (let y = 0; y < h; y++) {
      const sy = y + dy;
      if (sy < 0 || sy >= h) continue;
      const o = y * w;
      const s = sy * w;
      for (let x = 0; x < w; x++) if (row[s + x]) out.data[o + x] = 1;
    }
  }
  return out;
}

function bounds(m: Mask): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = m.w;
  let y0 = m.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (!m.data[y * m.w + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** Translate a mask by whole pixels (cells moved off the grid are dropped). */
export function shiftMask(m: Mask, dx: number, dy: number): Mask {
  const out = createMask(m.w, m.h);
  for (let y = 0; y < m.h; y++) {
    const ty = y + dy;
    if (ty < 0 || ty >= m.h) continue;
    for (let x = 0; x < m.w; x++) {
      const tx = x + dx;
      if (tx >= 0 && tx < m.w && m.data[y * m.w + x]) out.data[ty * m.w + tx] = 1;
    }
  }
  return out;
}

const clamp = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));

/** Score the learner's ink against the glyph mask. Both masks must have the same size. */
export function scoreAttempt(guide: Mask, ink: Mask, params: ScoreParams): ScoreResult {
  const none = { dx: 0, dy: 0 };
  const guideCount = countInk(guide);
  let inkCount = countInk(ink);
  if (guideCount === 0 || inkCount === 0) {
    return { coverage: 0, precision: 0, passed: false, reason: "empty", shift: none };
  }

  let shift = none;
  let learner = ink;
  if (params.align) {
    const gb = bounds(guide);
    const ib = bounds(ink);
    if (gb && ib) {
      const dx = Math.round(clamp((gb.x0 + gb.x1) / 2 - (ib.x0 + ib.x1) / 2, params.maxShift));
      const dy = Math.round(clamp((gb.y0 + gb.y1) / 2 - (ib.y0 + ib.y1) / 2, params.maxShift));
      shift = { dx, dy };
      learner = shiftMask(ink, dx, dy);
      inkCount = countInk(learner);
    }
  }

  const nearInk = dilate(learner, params.coverageTolerance);
  const nearGuide = dilate(guide, params.precisionTolerance);
  let covered = 0;
  let inside = 0;
  for (let i = 0; i < guide.data.length; i++) {
    if (guide.data[i] && nearInk.data[i]) covered++;
    if (learner.data[i] && nearGuide.data[i]) inside++;
  }
  const coverage = covered / guideCount;
  const precision = inkCount > 0 ? inside / inkCount : 0;
  const coverageOk = coverage >= params.minCoverage;
  const precisionOk = precision >= params.minPrecision;
  const reason: ScoreReason = coverageOk && precisionOk ? "ok" : !coverageOk && !precisionOk ? "both" : !coverageOk ? "missed" : "stray";
  return { coverage, precision, passed: coverageOk && precisionOk, reason, shift };
}

/** Score strokes directly (rasterises them first). */
export function scoreStrokes(guide: Mask, strokes: readonly Stroke[], params: ScoreParams): ScoreResult {
  return scoreAttempt(guide, rasterizeStrokes(strokes, guide.w), params);
}
