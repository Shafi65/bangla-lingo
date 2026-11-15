"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  cacheSupported,
  countCachedLessons,
  downloadClips,
  listCachedClips,
  removeAllAudio,
  requestPersistence,
  storageEstimate,
  type DownloadProgress,
} from "@/lib/offline/audio-cache";
import { formatBytes, packProgress, type AudioPackData } from "@/lib/offline/audio-packs";
import { useOnline } from "@/lib/offline/hooks";
import { swEnabled } from "@/lib/offline/register";

const ALL = "all";

interface Running {
  id: string;
  progress: DownloadProgress;
}

/** Audio downloads (per unit or everything) and offline status. Data comes from the server page. */
export function OfflinePanel({ data, lessonCount }: { data: AudioPackData; lessonCount: number }) {
  const online = useOnline();
  const [cached, setCached] = useState<Set<string> | null>(null);
  const [running, setRunning] = useState<Running | null>(null);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<number | null>(null);
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const supported = typeof window === "undefined" ? true : cacheSupported();

  const refresh = useCallback(async () => {
    if (!cacheSupported()) return;
    const [c, n, e] = await Promise.all([listCachedClips(), countCachedLessons(), storageEstimate()]);
    setCached(c);
    setSaved(n);
    setEstimate(e);
  }, []);

  // Lessons are saved by the service worker shortly after the first visit: keep checking until some are.
  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0);
    const poll = setInterval(() => {
      if (!running) void refresh();
    }, 2500);
    return () => {
      clearTimeout(t);
      clearInterval(poll);
    };
  }, [refresh, running]);

  const allIdx = data.files.map((_, i) => i);
  const rows = [{ id: ALL, title: "All audio", idx: allIdx, bytes: data.totalBytes }, ...data.packs];
  const have = cached ?? new Set<string>();
  const anyDownloaded = have.size > 0;

  async function start(id: string, idx: number[]) {
    if (running) return;
    const ctl = new AbortController();
    abort.current = ctl;
    setNote("");
    void requestPersistence();
    const files = idx.map((i) => data.files[i]);
    const sizes = idx.map((i) => data.sizes[i]);
    setRunning({ id, progress: { done: 0, total: files.length, bytesDone: 0, bytesTotal: sizes.reduce((a, b) => a + b, 0) } });
    try {
      const r = await downloadClips(files, sizes, {
        signal: ctl.signal,
        onProgress: (progress) => setRunning({ id, progress }),
      });
      if (r.quotaExceeded) setNote("Your device is out of storage space, so the download stopped. Remove some audio or free up space and try again.");
      else if (r.cancelled) setNote("Download stopped. What was saved stays on this device.");
      else if (r.failed > 0) setNote(`${r.failed} clip${r.failed === 1 ? "" : "s"} could not be downloaded. Check your connection and tap Download again.`);
      else setNote("Done. This audio now plays without a connection.");
    } catch {
      setNote("The download failed. Check your connection and try again.");
    } finally {
      abort.current = null;
      setRunning(null);
      await refresh();
    }
  }

  async function remove() {
    abort.current?.abort();
    await removeAllAudio();
    setNote("Downloaded audio removed.");
    await refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-3xl border-2 border-line bg-surface p-5">
        <h2 className="text-xl font-black">Lessons offline</h2>
        <p className="mt-1 font-semibold text-muted" data-testid="offline-lessons-status">
          {!supported || (typeof window !== "undefined" && !("serviceWorker" in navigator))
            ? "This browser can’t save the app for offline use."
            : !swEnabled()
              ? "Offline mode is only active in the published app."
              : saved === null
                ? "Checking…"
                : saved > 0
                  ? `${saved} of ${lessonCount} lessons are saved on this device. Pages you open are kept up to date when you are online.`
                  : "Getting ready. Stay online for a moment and lessons will be saved automatically."}
        </p>
      </section>

      <section className="rounded-3xl border-2 border-line bg-surface p-5" aria-labelledby="audio-h">
        <h2 id="audio-h" className="text-xl font-black">
          Audio for offline
        </h2>
        <p className="mt-1 font-semibold text-muted">
          Spoken Bengali is not saved by default. Download a unit, or everything ({formatBytes(data.totalBytes)}), to hear
          it without a connection.
        </p>
        {!online && <p className="mt-2 font-extrabold text-sun-dark">You are offline, so downloads are paused.</p>}
        {!supported && <p className="mt-2 font-extrabold text-accent-dark">This browser can’t store audio for offline use.</p>}

        <ul className="mt-4 flex flex-col gap-3">
          {rows.map((row) => {
            const p = packProgress(data, row.idx, have);
            const active = running?.id === row.id ? running.progress : null;
            const pct = active && active.bytesTotal > 0 ? Math.round((active.bytesDone / active.bytesTotal) * 100) : 0;
            const label = row.title;
            return (
              <li key={row.id} className={`rounded-2xl border-2 p-3 ${row.id === ALL ? "border-brand/40 bg-brand-light" : "border-line"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-extrabold">{row.title}</p>
                    <p className="text-sm font-semibold text-muted">
                      {row.idx.length} clips · {formatBytes(row.bytes)}
                      {p.have > 0 && !p.complete ? ` · ${p.have} saved` : ""}
                    </p>
                  </div>
                  {active ? (
                    <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={() => abort.current?.abort()}>
                      Cancel
                    </button>
                  ) : p.complete ? (
                    <span className="shrink-0 rounded-full bg-brand-light px-3 py-1 text-sm font-black text-brand-dark">Downloaded</span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm shrink-0"
                      disabled={!supported || !online || !!running}
                      aria-label={`${p.have > 0 ? "Download the rest of" : "Download"} ${label} for offline`}
                      onClick={() => void start(row.id, row.idx)}
                    >
                      {p.have > 0 ? "Download rest" : "Download"}
                    </button>
                  )}
                </div>
                {active && (
                  <div className="mt-3">
                    <div
                      role="progressbar"
                      aria-label={`Downloading ${label}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={pct}
                      className="h-3 overflow-hidden rounded-full bg-line"
                    >
                      <div className="h-full rounded-full bg-brand transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-sm font-semibold text-muted" aria-live="polite">
                      {formatBytes(active.bytesDone)} of {formatBytes(active.bytesTotal)} · {active.done} of {active.total} clips
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {note && (
          <p role="status" className="mt-3 font-extrabold">
            {note}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-muted">
            {estimate
              ? `This site uses ${formatBytes(estimate.usage)} of about ${formatBytes(estimate.quota)} available.`
              : "Saved on this device only."}
          </p>
          {anyDownloaded && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void remove()}>
              Remove downloaded audio
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
