// Background sync between the local stores (source of truth) and the signed-in user's server rows.
//
// One sync cycle, per document: pull the server row, merge it with the local value (pure rules in
// merge.ts), write the result locally if it changed, then push it if it differs from the server
// copy. Pushes are conditional on the row's revision ("update ... where rev = n"), so two devices
// syncing at once cannot overwrite each other: the loser re-pulls and merges again.
//
// When cycles run: on start (sign-in or page load with a session), ~5 s after the last local change
// (debounced), when the page is hidden, when the browser comes back online, and on "Sync now".
// Failures never touch local data: the status turns to Offline or Error and the cycle is retried
// with exponential backoff (2 s, 4 s, 8 s ... capped at 5 min), or at once when back online.
import { byteLength, MAX_DOC_BYTES, SCHEMA_VERSION, stableStringify } from "./codec";
import type { DocAdapter, SyncTable } from "./adapters";

export interface RemoteDoc {
  data: unknown;
  rev: number;
  schemaVersion: number;
}

export type PushResult = "ok" | "conflict";

/** Server access for the signed-in user (see remote.ts for the Supabase version). */
export interface Remote {
  pull(table: SyncTable): Promise<RemoteDoc | null>;
  /** Insert (prevRev null) or update where rev = prevRev, setting rev to prevRev + 1. */
  push(table: SyncTable, data: unknown, schemaVersion: number, prevRev: number | null): Promise<PushResult>;
}

export type SyncState = "idle" | "syncing" | "synced" | "offline" | "error";

export interface SyncStatus {
  state: SyncState;
  /** Epoch ms of the last successful cycle. */
  lastSyncedAt?: number;
  /** Short, human-readable reason for "error". */
  error?: string;
  /** Epoch ms of the next automatic retry. */
  retryAt?: number;
}

export interface Timers {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface SyncEnv {
  online(): boolean;
  /** Calls `cb` when the browser comes back online; returns an unsubscribe. */
  onOnline(cb: () => void): () => void;
  /** Calls `cb` when the page is hidden (tab switch, app backgrounded, closing). */
  onHidden(cb: () => void): () => void;
}

export class SyncError extends Error {
  constructor(
    message: string,
    /** False when retrying cannot help (e.g. a document too large, a newer server format). */
    readonly retryable = true,
  ) {
    super(message);
  }
}

export const DEBOUNCE_MS = 5_000;
export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_MAX_MS = 5 * 60_000;
/** Conflicting pushes in a row before a cycle gives up (and backs off). */
const MAX_CONFLICTS = 4;

/** Delay before retry number `attempt` (1-based): 2 s, 4 s, 8 s ... capped at 5 min. */
export function backoffDelay(attempt: number, base = BACKOFF_BASE_MS, max = BACKOFF_MAX_MS): number {
  return Math.min(max, base * 2 ** Math.max(0, attempt - 1));
}

export const realTimers: Timers = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

export const browserEnv: SyncEnv = {
  online: () => typeof navigator === "undefined" || navigator.onLine !== false,
  onOnline(cb) {
    window.addEventListener("online", cb);
    return () => window.removeEventListener("online", cb);
  },
  onHidden(cb) {
    const onVis = () => {
      if (document.visibilityState === "hidden") cb();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", cb);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", cb);
    };
  },
};

export interface SyncEngineOptions {
  remote: Remote;
  adapters: DocAdapter[];
  timers?: Timers;
  env?: SyncEnv;
  debounceMs?: number;
}

export class SyncEngine {
  private readonly remote: Remote;
  private readonly adapters: DocAdapter[];
  private readonly timers: Timers;
  private readonly env: SyncEnv;
  private readonly debounceMs: number;

  private status: SyncStatus = { state: "idle" };
  private listeners = new Set<() => void>();
  private offs: (() => void)[] = [];
  private debounce: unknown = null;
  private retry: unknown = null;
  private failures = 0;
  private running: Promise<void> | null = null;
  private rerun = false;
  private dirty = false;
  private applying = false;
  private stopped = true;

  constructor(opts: SyncEngineOptions) {
    this.remote = opts.remote;
    this.adapters = opts.adapters;
    this.timers = opts.timers ?? realTimers;
    this.env = opts.env ?? browserEnv;
    this.debounceMs = opts.debounceMs ?? DEBOUNCE_MS;
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Start watching local changes and run the first (sign-in) cycle: pull, merge, write, push. */
  start(): Promise<void> {
    if (!this.stopped) return this.syncNow();
    this.stopped = false;
    for (const a of this.adapters) this.offs.push(a.subscribe(() => this.onLocalChange()));
    this.offs.push(this.env.onOnline(() => void this.syncNow()));
    this.offs.push(this.env.onHidden(() => void this.flush()));
    return this.syncNow();
  }

  /** Stop all timers and listeners. Local data is untouched. */
  stop(): void {
    this.stopped = true;
    this.offs.forEach((off) => off());
    this.offs = [];
    this.clearTimer("debounce");
    this.clearTimer("retry");
    this.setStatus({ state: "idle" });
  }

  /** Local change: push after the debounce window (restarted by every change). */
  private onLocalChange() {
    if (this.applying || this.stopped) return;
    this.dirty = true;
    this.clearTimer("debounce");
    this.debounce = this.timers.setTimeout(() => {
      this.debounce = null;
      void this.syncNow();
    }, this.debounceMs);
  }

  /** Run a pending (debounced) push now; a no-op when nothing changed. */
  flush(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (!this.dirty && !this.debounce) return this.running ?? Promise.resolve();
    this.clearTimer("debounce");
    return this.syncNow();
  }

  /** Run a cycle now (single-flight: a call during a cycle schedules one more afterwards). */
  syncNow(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.running) {
      this.rerun = true;
      return this.running;
    }
    this.clearTimer("retry");
    this.running = (async () => {
      do {
        this.rerun = false;
        await this.cycle();
      } while (this.rerun && !this.stopped);
      this.running = null;
    })();
    return this.running;
  }

  private async cycle() {
    if (!this.env.online()) {
      this.setStatus({ ...this.status, state: "offline", error: undefined, retryAt: undefined });
      return; // the online listener restarts us
    }
    this.dirty = false;
    this.setStatus({ ...this.status, state: "syncing", error: undefined, retryAt: undefined });
    try {
      for (const a of this.adapters) {
        if (this.stopped) return;
        await this.syncDoc(a);
      }
      if (this.stopped) return;
      this.failures = 0;
      this.setStatus({ state: "synced", lastSyncedAt: this.timers.now() });
    } catch (e) {
      if (this.stopped) return;
      this.dirty = true;
      this.failures++;
      if (!this.env.online()) {
        this.setStatus({ ...this.status, state: "offline", error: undefined, retryAt: undefined });
        return;
      }
      const retryable = !(e instanceof SyncError) || e.retryable;
      const message = e instanceof SyncError ? e.message : "Couldn't reach the server";
      if (!retryable) {
        this.setStatus({ ...this.status, state: "error", error: message, retryAt: undefined });
        return;
      }
      const delay = backoffDelay(this.failures);
      const retryAt = this.timers.now() + delay;
      this.setStatus({ ...this.status, state: "error", error: message, retryAt });
      this.retry = this.timers.setTimeout(() => {
        this.retry = null;
        void this.syncNow();
      }, delay);
    }
  }

  private async syncDoc(a: DocAdapter) {
    for (let attempt = 0; attempt < MAX_CONFLICTS; attempt++) {
      const doc = await this.remote.pull(a.table);
      if (this.stopped) return;
      if (doc && doc.schemaVersion > SCHEMA_VERSION) {
        throw new SyncError("Your account was saved by a newer version of the app. Reload to update.", false);
      }
      // Read, merge and write without awaiting, so no local change can slip in between.
      const local = a.read();
      const remoteVal = doc ? a.parse(doc.data) : null;
      const merged = remoteVal ? a.merge(local, remoteVal) : local;
      const encoded = a.encode(merged);
      const mergedStr = stableStringify(encoded);
      if (mergedStr !== stableStringify(a.encode(local))) {
        this.applying = true;
        try {
          a.write(merged);
        } finally {
          this.applying = false;
        }
      }
      if (doc && mergedStr === stableStringify(doc.data)) return; // server already up to date
      if (byteLength(mergedStr) > MAX_DOC_BYTES) {
        throw new SyncError("Your saved data is too large to sync.", false);
      }
      const r = await this.remote.push(a.table, encoded, SCHEMA_VERSION, doc ? doc.rev : null);
      if (r === "ok") return;
      // conflict: another device wrote in between; pull and merge again
    }
    throw new SyncError("Another device kept saving at the same time. Will try again.");
  }

  private setStatus(s: SyncStatus) {
    this.status = s;
    this.listeners.forEach((l) => l());
  }

  private clearTimer(which: "debounce" | "retry") {
    const h = this[which];
    if (h !== null) this.timers.clearTimeout(h);
    this[which] = null;
  }
}
