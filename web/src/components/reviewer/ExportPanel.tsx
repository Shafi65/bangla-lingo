"use client";

import { useRef, useState } from "react";
import { buildRows, exportFileName, parseImport, toCsv, toJsonExport } from "@/lib/reviewer/export";
import { mergeStates } from "@/lib/reviewer/storage";
import { reviewStore, useReviewState } from "@/lib/reviewer/store";

function download(name: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportPanel({ lessonOrder }: { lessonOrder: string[] }) {
  const state = useReviewState();
  const rows = buildRows(state, lessonOrder);
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function onImport(file: File | undefined) {
    if (!file) return;
    const res = parseImport(await file.text());
    if (!res.ok) {
      setMessage({ ok: false, text: res.error });
    } else {
      let taken = 0;
      reviewStore.update((s) => {
        const m = mergeStates(s, res.state);
        taken = m.taken;
        return m.state;
      });
      setMessage({
        ok: true,
        text: taken
          ? `Imported ${taken} ${taken === 1 ? "entry" : "entries"} (newer ones win; your newer local edits were kept).`
          : "Nothing new in that file: everything in it is already here.",
      });
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <section id="export-panel" aria-label="Export and import" className="border-t-2 border-line bg-paper">
      <div className="mx-auto w-full max-w-5xl space-y-3 px-3 py-3 sm:px-5">
        <p className="text-sm font-semibold text-ink/90">
          Everything is saved in this browser only. Export to send your review back (CSV opens in a spreadsheet; JSON lets you continue on
          another device with Import).
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() => download(exportFileName(state.reviewer, "csv"), "text/csv", toCsv(rows))}
            className="min-h-10 rounded-xl border-2 border-brand bg-brand px-4 text-base font-extrabold text-white disabled:cursor-not-allowed disabled:border-line-strong disabled:bg-line disabled:text-muted"
          >
            Download CSV ({rows.length} {rows.length === 1 ? "row" : "rows"})
          </button>
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() => download(exportFileName(state.reviewer, "json"), "application/json", toJsonExport(state))}
            className="min-h-10 rounded-xl border-2 border-line-strong bg-surface px-4 text-base font-extrabold hover:bg-sunk disabled:cursor-not-allowed disabled:text-muted"
          >
            Download JSON
          </button>
          <label className="inline-flex min-h-10 cursor-pointer items-center rounded-xl border-2 border-line-strong bg-surface px-4 text-base font-extrabold hover:bg-sunk has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus">
            Import JSON
            <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => void onImport(e.target.files?.[0])} />
          </label>
        </div>
        {!state.reviewer && <p className="text-sm font-extrabold text-sun-dark">Add your name above so the export says who reviewed.</p>}
        {message && (
          <p role="status" className={`text-sm font-extrabold ${message.ok ? "text-brand-dark" : "text-accent-dark"}`}>
            {message.text}
          </p>
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border-2 border-line bg-surface">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <caption className="sr-only">Preview of the first rows of the export</caption>
              <thead className="bg-sunk text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-2 py-1">Lesson</th>
                  <th className="px-2 py-1">Item</th>
                  <th className="px-2 py-1">Verdict</th>
                  <th className="px-2 py-1">Correction</th>
                  <th className="px-2 py-1">Comment</th>
                  <th className="px-2 py-1">Bengali</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 6).map((r, i) => (
                  <tr key={i} className="border-t border-line align-top">
                    <td className="px-2 py-1 font-mono whitespace-nowrap">{r.lessonId}</td>
                    <td className="px-2 py-1 font-mono">{r.exerciseId}</td>
                    <td className="px-2 py-1 font-bold">{r.verdict}</td>
                    <td className="px-2 py-1 [overflow-wrap:anywhere]">{r.correction}</td>
                    <td className="px-2 py-1 [overflow-wrap:anywhere]">{r.comment}</td>
                    <td lang="bn" className="min-w-56 px-2 py-1 [overflow-wrap:anywhere]">
                      {r.bengali}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 6 && <p className="border-t border-line px-2 py-1 text-xs font-bold text-muted">… and {rows.length - 6} more rows</p>}
          </div>
        )}
      </div>
    </section>
  );
}
