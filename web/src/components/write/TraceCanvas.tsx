"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { drawGlyph, ensureGuideFont } from "@/lib/write/glyph";
import { BRUSH_RADIUS, MASK_SIZE, type Point, type Stroke } from "@/lib/write/scoring";

export type GuideMode = "off" | "faint" | "overlay";

const cssVar = (el: Element, name: string, fallback: string) =>
  getComputedStyle(el).getPropertyValue(name).trim() || fallback;

/**
 * Square drawing surface. Two stacked canvases: the guide (glyph from the font, drawn faintly or as
 * an overlay) underneath, and the learner's ink on top. Pointer events cover finger, stylus and
 * mouse; the canvas backing store is scaled by devicePixelRatio. Strokes are kept in normalised
 * coordinates so they survive resizes and are what gets scored.
 */
export function TraceCanvas({
  glyph,
  guide,
  strokes,
  onStrokesChange,
  onDrawStart,
  shift,
  label,
}: {
  glyph: string;
  guide: GuideMode;
  strokes: Stroke[];
  onStrokesChange: (next: Stroke[]) => void;
  onDrawStart?: () => void;
  /** Mask-pixel offset applied when drawing strokes (the memory comparison alignment). */
  shift?: { dx: number; dy: number };
  label: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const guideRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const live = useRef<{ id: number; points: Stroke } | null>(null);
  const [px, setPx] = useState(0); // backing-store size in device pixels
  const [fontReady, setFontReady] = useState(0);
  const [themeTick, setThemeTick] = useState(0);

  // Track size and devicePixelRatio.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const css = el.getBoundingClientRect().width;
      setPx(Math.max(1, Math.round(css * (window.devicePixelRatio || 1))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // Redraw when the light/dark theme flips (canvas cannot read CSS variables live).
  useEffect(() => {
    const mo = new MutationObserver(() => setThemeTick((n) => n + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    void ensureGuideFont(glyph).then(() => alive && setFontReady((n) => n + 1));
    return () => {
      alive = false;
    };
  }, [glyph]);

  // Guide layer.
  useEffect(() => {
    const c = guideRef.current;
    const wrap = wrapRef.current;
    if (!c || !wrap || px === 0) return;
    c.width = px;
    c.height = px;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, px, px);
    if (guide === "off") return;
    ctx.fillStyle = guide === "faint" ? cssVar(wrap, "--color-line-strong", "#cbd5d1") : cssVar(wrap, "--color-brand", "#006a4e");
    ctx.globalAlpha = guide === "faint" ? 0.85 : 0.32;
    drawGlyph(ctx, glyph, px);
  }, [glyph, guide, px, fontReady, themeTick]);

  const paint = useCallback(
    (list: readonly Stroke[], dx = 0, dy = 0) => {
      const c = inkRef.current;
      const wrap = wrapRef.current;
      if (!c || !wrap || px === 0) return;
      if (c.width !== px) {
        c.width = px;
        c.height = px;
      }
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, px, px);
      ctx.strokeStyle = cssVar(wrap, "--color-ink", "#1f2a2e");
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = ((2 * BRUSH_RADIUS) / MASK_SIZE) * px;
      const ox = (dx / MASK_SIZE) * px;
      const oy = (dy / MASK_SIZE) * px;
      for (const s of list) {
        if (s.length === 0) continue;
        if (s.length === 1) {
          ctx.beginPath();
          ctx.arc(s[0].x * px + ox, s[0].y * px + oy, ctx.lineWidth / 2, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        ctx.beginPath();
        ctx.moveTo(s[0].x * px + ox, s[0].y * px + oy);
        for (let i = 1; i < s.length; i++) ctx.lineTo(s[i].x * px + ox, s[i].y * px + oy);
        ctx.stroke();
      }
    },
    [px],
  );

  useEffect(() => {
    paint(strokes, shift?.dx, shift?.dy);
  }, [paint, strokes, shift, themeTick]);

  const toPoint = (e: { clientX: number; clientY: number }): Point => {
    const r = inkRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (live.current) return; // one pointer at a time
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    onDrawStart?.();
    live.current = { id: e.pointerId, points: [toPoint(e)] };
    paint([...strokes, live.current.points]);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const l = live.current;
    if (!l || l.id !== e.pointerId) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e.nativeEvent]) l.points.push(toPoint(ev));
    paint([...strokes, l.points]);
  };

  const finish = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const l = live.current;
    if (!l || l.id !== e.pointerId) return;
    live.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    onStrokesChange([...strokes, l.points]);
  };

  return (
    <div
      ref={wrapRef}
      className="relative mx-auto aspect-square w-full max-w-[26rem] overflow-hidden rounded-[var(--radius-card)] border-2 border-line-strong bg-surface"
    >
      {/* Faint centre lines to help with placing and size. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/2 right-0 left-0 border-t-2 border-dashed border-line" />
        <div className="absolute top-0 bottom-0 left-1/2 border-l-2 border-dashed border-line" />
      </div>
      <canvas ref={guideRef} data-testid="guide-canvas" aria-hidden className="absolute inset-0 h-full w-full" />
      <canvas
        ref={inkRef}
        data-testid="ink-canvas"
        role="img"
        aria-label={label}
        className="absolute inset-0 h-full w-full cursor-crosshair"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}
