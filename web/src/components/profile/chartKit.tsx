"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Chart colours. One green ramp (validated light→dark ordinal steps against
 * each mode's surface) used for every magnitude on the page; dark mode has its
 * own steps, not an automatic flip.
 */
export const VIZ_VARS =
  "[--viz-1:#7cc0a0] [--viz-2:#4a9f7b] [--viz-3:#1f7d5b] [--viz-4:#004d37] [--viz-bar:#1f7d5b] " +
  "dark:[--viz-1:#1f5a45] dark:[--viz-2:#2f8a67] dark:[--viz-3:#55bb91] dark:[--viz-4:#a6e6c8] dark:[--viz-bar:#55bb91]";

/** Width of an element, tracked (0 until measured). */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Floating readout: value first, label after. Positioned in the chart's own box. */
export function Tip({ x, y, value, label, width }: { x: number; y: number; value: string; label: string; width: number }) {
  const W = 150;
  const left = Math.max(0, Math.min(width - W, x - W / 2));
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute z-10 rounded-xl border-2 border-line bg-surface px-3 py-1.5 shadow-[var(--shadow-lift)]"
      style={{ left, top: Math.max(0, y), width: W }}
    >
      <p className="text-base leading-tight font-black text-ink">{value}</p>
      <p className="text-xs leading-tight font-bold text-muted">{label}</p>
    </div>
  );
}

/** A chart card: title, one-line description, the chart, and a table view behind a disclosure. */
export function ChartCard({
  id,
  title,
  note,
  children,
  table,
}: {
  id: string;
  title: string;
  note?: ReactNode;
  children: ReactNode;
  table?: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="card mt-4 p-4 sm:p-5">
      <h3 id={id} className="text-lg leading-tight font-black">
        {title}
      </h3>
      {note && <p className="mt-0.5 text-sm font-semibold text-muted">{note}</p>}
      <div className="mt-4">{children}</div>
      {table && (
        <details className="group mt-3">
          <summary className="inline-flex cursor-pointer items-center gap-1 rounded-lg text-sm font-extrabold text-brand-dark select-none">
            <span className="transition-transform group-open:rotate-90" aria-hidden>
              ›
            </span>
            Show as table
          </summary>
          <div className="mt-2 max-h-64 overflow-auto rounded-xl border-2 border-line">{table}</div>
        </details>
      )}
    </section>
  );
}

export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="sticky top-0 bg-sunk">
        <tr>
          {head.map((h, i) => (
            <th key={h} scope="col" className={`px-3 py-1.5 font-extrabold text-muted ${i ? "text-right" : ""}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={String(r[0])} className="border-t border-line">
            {r.map((c, i) => (
              <td key={i} className={`px-3 py-1 font-semibold ${i ? "text-right tabular-nums" : ""}`}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
