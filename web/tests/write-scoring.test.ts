import { describe, expect, it } from "vitest";
import {
  MASK_SIZE,
  MEMORY_PARAMS,
  TRACE_PARAMS,
  countInk,
  dilate,
  createMask,
  rasterizeStrokes,
  scoreStrokes,
  type Mask,
  type Stroke,
} from "../src/lib/write/scoring";

// A letter-like test glyph (bowl, stem and headline), drawn 10 mask-px thick like a font stem.
function circle(cx: number, cy: number, r: number, n = 48): Stroke {
  return Array.from({ length: n + 1 }, (_, i) => ({
    x: cx + r * Math.cos((i / n) * Math.PI * 2),
    y: cy + r * Math.sin((i / n) * Math.PI * 2),
  }));
}
const line = (x0: number, y0: number, x1: number, y1: number): Stroke => [
  { x: x0, y: y0 },
  { x: x1, y: y1 },
];
const GLYPH: Stroke[] = [circle(0.42, 0.58, 0.17), line(0.72, 0.3, 0.72, 0.8), line(0.22, 0.3, 0.78, 0.3)];
const GUIDE: Mask = rasterizeStrokes(GLYPH, MASK_SIZE, 5);

// Deterministic PRNG so the tests never flake.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** A careful trace: the glyph's own path with small smooth wobble (up to ~1.5 mask px). */
function carefulTrace(seed: number, amp = 0.01): Stroke[] {
  const r = rng(seed);
  const phase = r() * 6;
  return GLYPH.map((s) =>
    s.map((p, i) => ({ x: p.x + amp * Math.sin(i * 0.7 + phase), y: p.y + amp * Math.cos(i * 0.9 + phase) })),
  );
}
const moved = (strokes: Stroke[], dx: number, dy: number): Stroke[] =>
  strokes.map((s) => s.map((p) => ({ x: p.x + dx, y: p.y + dy })));

function scribble(seed: number, n = 400): Stroke[] {
  const r = rng(seed);
  const pts: Stroke = [];
  let x = r();
  let y = r();
  for (let i = 0; i < n; i++) {
    x = Math.min(1, Math.max(0, x + (r() - 0.5) * 0.25));
    y = Math.min(1, Math.max(0, y + (r() - 0.5) * 0.25));
    pts.push({ x, y });
  }
  return [pts];
}

describe("dilate", () => {
  it("grows a single pixel into a disc of the given radius", () => {
    const m = createMask(21);
    m.data[10 * 21 + 10] = 1;
    const d = dilate(m, 4);
    expect(d.data[10 * 21 + 14]).toBe(1);
    expect(d.data[10 * 21 + 15]).toBe(0);
    expect(d.data[14 * 21 + 14]).toBe(0); // corner of the square is outside the disc
    expect(countInk(d)).toBeGreaterThan(40);
  });
});

describe("trace scoring", () => {
  it("passes a perfect trace", () => {
    const r = scoreStrokes(GUIDE, GLYPH, TRACE_PARAMS);
    expect(r.passed).toBe(true);
    expect(r.coverage).toBeGreaterThan(0.95);
    expect(r.precision).toBeGreaterThan(0.95);
    expect(r.reason).toBe("ok");
  });

  it("passes careful traces with natural wobble", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const r = scoreStrokes(GUIDE, carefulTrace(seed), TRACE_PARAMS);
      expect(r.passed, `seed ${seed}: ${JSON.stringify(r)}`).toBe(true);
    }
  });

  it("fails an empty canvas", () => {
    const r = scoreStrokes(GUIDE, [], TRACE_PARAMS);
    expect(r.passed).toBe(false);
    expect(r.reason).toBe("empty");
    expect(r.coverage).toBe(0);
  });

  it("fails random scribbles", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const r = scoreStrokes(GUIDE, scribble(seed), TRACE_PARAMS);
      expect(r.passed, `seed ${seed}: ${JSON.stringify(r)}`).toBe(false);
    }
  });

  it("fails an offset trace", () => {
    expect(scoreStrokes(GUIDE, moved(GLYPH, 0.14, 0.1), TRACE_PARAMS).passed).toBe(false);
    expect(scoreStrokes(GUIDE, moved(GLYPH, 0.06, 0.03), TRACE_PARAMS).passed).toBe(false);
    expect(scoreStrokes(GUIDE, moved(GLYPH, 0.02, 0.01), TRACE_PARAMS).passed).toBe(true);
  });

  it("fails a trace that only covers part of the letter", () => {
    const r = scoreStrokes(GUIDE, [GLYPH[0]], TRACE_PARAMS);
    expect(r.passed).toBe(false);
    expect(r.reason).toBe("missed");
    expect(r.precision).toBeGreaterThan(0.9);
  });

  it("fails a trace with lots of stray ink", () => {
    const r = scoreStrokes(GUIDE, [...GLYPH, ...scribble(3, 200)], TRACE_PARAMS);
    expect(r.passed).toBe(false);
    expect(r.reason).toBe("stray");
    expect(r.coverage).toBeGreaterThan(0.9);
  });

  it("fails a filled-in blob", () => {
    const fill: Stroke[] = [];
    for (let y = 0.05; y < 0.95; y += 0.03) fill.push(line(0.05, y, 0.95, y));
    const r = scoreStrokes(GUIDE, fill, TRACE_PARAMS);
    expect(r.passed).toBe(false);
  });
});

describe("memory scoring", () => {
  it("is looser than tracing: a rough but recognisable attempt passes", () => {
    const rough = carefulTrace(4, 0.08);
    expect(scoreStrokes(GUIDE, rough, TRACE_PARAMS).passed).toBe(false);
    expect(scoreStrokes(GUIDE, rough, MEMORY_PARAMS).passed).toBe(true);
  });

  it("forgives a small shift of the whole letter by aligning it", () => {
    const shifted = moved(GLYPH, 0.07, -0.06);
    expect(scoreStrokes(GUIDE, shifted, TRACE_PARAMS).passed).toBe(false);
    const r = scoreStrokes(GUIDE, shifted, MEMORY_PARAMS);
    expect(r.passed).toBe(true);
    expect(r.shift.dx).toBeLessThan(0);
    expect(r.shift.dy).toBeGreaterThan(0);
  });

  it("still fails empty canvases, scribbles and a different shape", () => {
    expect(scoreStrokes(GUIDE, [], MEMORY_PARAMS).passed).toBe(false);
    for (let seed = 1; seed <= 10; seed++) {
      expect(scoreStrokes(GUIDE, scribble(seed), MEMORY_PARAMS).passed, `seed ${seed}`).toBe(false);
    }
    const other: Stroke[] = [circle(0.5, 0.5, 0.3), line(0.2, 0.8, 0.8, 0.2)];
    expect(scoreStrokes(GUIDE, other, MEMORY_PARAMS).passed).toBe(false);
  });
});
