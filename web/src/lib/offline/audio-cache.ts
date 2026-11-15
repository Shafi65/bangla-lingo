// Browser-only helpers for downloaded audio (Cache Storage). The service worker serves these
// clips (see public/sw.js); nothing here runs on the server.
import { AUDIO_CACHE, audioUrl } from "./cache-names";

export const cacheSupported = () => typeof window !== "undefined" && "caches" in window;

/** File names of every clip currently downloaded. */
export async function listCachedClips(): Promise<Set<string>> {
  if (!cacheSupported() || !(await caches.has(AUDIO_CACHE))) return new Set();
  const cache = await caches.open(AUDIO_CACHE);
  const prefix = "/audio/";
  const out = new Set<string>();
  for (const req of await cache.keys()) {
    const p = new URL(req.url).pathname;
    if (p.startsWith(prefix)) out.add(decodeURIComponent(p.slice(prefix.length)));
  }
  return out;
}

export interface DownloadResult {
  done: number;
  failed: number;
  /** Storage ran out; remaining clips were not fetched. */
  quotaExceeded: boolean;
  cancelled: boolean;
}

export interface DownloadProgress {
  /** Clips finished (including ones that were already stored). */
  done: number;
  total: number;
  bytesDone: number;
  bytesTotal: number;
}

const isQuotaError = (e: unknown) =>
  e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22);

/** Fetches `files` into the audio cache (4 at a time), skipping ones already stored. */
export async function downloadClips(
  files: readonly string[],
  sizes: readonly number[],
  opts: { signal?: AbortSignal; onProgress?: (p: DownloadProgress) => void; concurrency?: number } = {},
): Promise<DownloadResult> {
  const cache = await caches.open(AUDIO_CACHE);
  const have = await listCachedClips();
  const total = files.length;
  const bytesTotal = sizes.reduce((a, b) => a + b, 0);
  let done = 0;
  let failed = 0;
  let bytesDone = 0;
  let quota = false;
  let next = 0;
  const tick = () => opts.onProgress?.({ done, total, bytesDone, bytesTotal });
  tick();

  const worker = async () => {
    while (!opts.signal?.aborted && !quota) {
      const i = next++;
      if (i >= total) return;
      const file = files[i];
      try {
        if (!have.has(file)) {
          const res = await fetch(audioUrl(file), { signal: opts.signal, cache: "no-cache" });
          if (!res.ok || res.status === 206) throw new Error(`HTTP ${res.status}`);
          await cache.put(audioUrl(file), res);
        }
        done++;
        bytesDone += sizes[i];
      } catch (e) {
        if (opts.signal?.aborted) return;
        if (isQuotaError(e)) quota = true;
        else failed++;
      }
      tick();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 4) }, worker));
  return { done, failed, quotaExceeded: quota, cancelled: !!opts.signal?.aborted };
}

export async function removeAllAudio(): Promise<void> {
  if (cacheSupported()) await caches.delete(AUDIO_CACHE);
}

/** Asks the browser not to evict our storage under pressure (best effort; ignored where unsupported). */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    // ignore
  }
  return false;
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (e && typeof e.usage === "number" && typeof e.quota === "number") return { usage: e.usage, quota: e.quota };
  } catch {
    // ignore
  }
  return null;
}

/** Number of pages saved for offline use (all shell caches), or null when Cache Storage is unavailable. */
export async function countCachedLessons(): Promise<number | null> {
  if (!cacheSupported()) return null;
  let n = 0;
  for (const name of await caches.keys()) {
    if (!name.startsWith("bl-shell-")) continue;
    const cache = await caches.open(name);
    for (const req of await cache.keys()) if (new URL(req.url).pathname.startsWith("/lesson/")) n++;
  }
  return n;
}
