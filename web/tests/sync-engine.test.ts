import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocAdapter, SyncTable } from "@/lib/sync/adapters";
import { backoffDelay, SyncEngine, type Remote, type RemoteDoc, type SyncEnv } from "@/lib/sync/engine";
import { SCHEMA_VERSION } from "@/lib/sync/codec";

/** A local "store" holding a set of strings, merged by union. */
function setAdapter(table: SyncTable, initial: string[] = []) {
  let value = [...initial].sort();
  const listeners = new Set<() => void>();
  const adapter: DocAdapter<string[]> = {
    table,
    read: () => value,
    write: (next) => {
      value = next;
      listeners.forEach((l) => l());
    },
    encode: (v) => ({ items: v }),
    parse: (d) => (d && typeof d === "object" && Array.isArray((d as { items?: unknown }).items) ? ((d as { items: string[] }).items) : null),
    merge: (a, b) => [...new Set([...a, ...b])].sort(),
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  return {
    adapter,
    get: () => value,
    /** A user action on this device. */
    add(x: string) {
      value = [...new Set([...value, x])].sort();
      listeners.forEach((l) => l());
    },
  };
}

/** In-memory server with revision checks, plus failure injection. */
function memoryRemote() {
  const rows = new Map<SyncTable, RemoteDoc>();
  const calls: string[] = [];
  let failNext = 0;
  let conflictNext = 0;
  const remote: Remote = {
    async pull(table) {
      calls.push(`pull:${table}`);
      if (failNext > 0) {
        failNext--;
        throw new Error("network down");
      }
      const r = rows.get(table);
      return r ? structuredClone(r) : null;
    },
    async push(table, data, schemaVersion, prevRev) {
      calls.push(`push:${table}`);
      if (conflictNext > 0) {
        conflictNext--;
        // Someone else wrote first.
        const cur = rows.get(table);
        rows.set(table, { data: { items: ["from-other-device"] }, rev: (cur?.rev ?? 0) + 1, schemaVersion });
        return "conflict";
      }
      const cur = rows.get(table);
      if ((cur ? cur.rev : null) !== prevRev) return "conflict";
      rows.set(table, { data: structuredClone(data), rev: (prevRev ?? 0) + 1, schemaVersion });
      return "ok";
    },
  };
  return {
    remote,
    rows,
    calls,
    failTimes: (n: number) => (failNext = n),
    conflictTimes: (n: number) => (conflictNext = n),
  };
}

function fakeEnv() {
  let online = true;
  const onl = new Set<() => void>();
  const hid = new Set<() => void>();
  const env: SyncEnv = {
    online: () => online,
    onOnline: (cb) => (onl.add(cb), () => onl.delete(cb)),
    onHidden: (cb) => (hid.add(cb), () => hid.delete(cb)),
  };
  return {
    env,
    goOffline: () => (online = false),
    goOnline: () => {
      online = true;
      onl.forEach((f) => f());
    },
    hide: () => hid.forEach((f) => f()),
  };
}

const timers = {
  now: () => Date.now(),
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-10T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("backoff", () => {
  it("doubles from 2 s and caps at 5 min", () => {
    expect([1, 2, 3, 4].map((n) => backoffDelay(n))).toEqual([2000, 4000, 8000, 16000]);
    expect(backoffDelay(20)).toBe(300_000);
  });
});

describe("SyncEngine", () => {
  it("on start: pulls, merges, writes local, then pushes the merged value", async () => {
    const s = setAdapter("user_progress", ["local-1"]);
    const r = memoryRemote();
    r.rows.set("user_progress", { data: { items: ["remote-1"] }, rev: 3, schemaVersion: 1 });
    const e = new SyncEngine({ remote: r.remote, adapters: [s.adapter], timers, env: fakeEnv().env });
    await e.start();
    expect(s.get()).toEqual(["local-1", "remote-1"]);
    expect(r.rows.get("user_progress")).toMatchObject({ data: { items: ["local-1", "remote-1"] }, rev: 4, schemaVersion: SCHEMA_VERSION });
    expect(e.getStatus().state).toBe("synced");
    expect(r.calls).toEqual(["pull:user_progress", "push:user_progress"]);
    e.stop();
  });

  it("does not push when the server already matches", async () => {
    const s = setAdapter("user_memory", ["a"]);
    const r = memoryRemote();
    r.rows.set("user_memory", { data: { items: ["a"] }, rev: 1, schemaVersion: 1 });
    const e = new SyncEngine({ remote: r.remote, adapters: [s.adapter], timers, env: fakeEnv().env });
    await e.start();
    expect(r.calls).toEqual(["pull:user_memory"]);
    e.stop();
  });

  it("debounces local changes by ~5 s (each change restarts the window)", async () => {
    const s = setAdapter("user_progress");
    const r = memoryRemote();
    const e = new SyncEngine({ remote: r.remote, adapters: [s.adapter], timers, env: fakeEnv().env });
    await e.start();
    r.calls.length = 0;
    s.add("x");
    await vi.advanceTimersByTimeAsync(3000);
    s.add("y");
    await vi.advanceTimersByTimeAsync(4000);
    expect(r.calls).toEqual([]); // 4 s since the last change
    await vi.advanceTimersByTimeAsync(1100);
    expect(r.calls).toEqual(["pull:user_progress", "push:user_progress"]);
    expect(r.rows.get("user_progress")?.data).toEqual({ items: ["x", "y"] });
    e.stop();
  });

  it("writes it makes itself do not trigger another push", async () => {
    const s = setAdapter("user_progress", ["a"]);
    const r = memoryRemote();
    r.rows.set("user_progress", { data: { items: ["b"] }, rev: 1, schemaVersion: 1 });
    const e = new SyncEngine({ remote: r.remote, adapters: [s.adapter], timers, env: fakeEnv().env });
    await e.start();
    r.calls.length = 0;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(r.calls).toEqual([]);
    e.stop();
  });

  it("pushes at once when the page is hidden", async () => {
    const s = setAdapter("user_progress");
    const r = memoryRemote();
    const f = fakeEnv();
    const e = new SyncEngine({ remote: r.remote, adapters: [s.adapter], timers, env: f.env });
    await e.start();
    r.calls.length = 0;
    s.add("x");
    f.hide();
    await vi.advanceTimersByTimeAsync(0);
    expect(r.calls).toContain("push:user_progress");
    // nothing pending: hiding again does nothing
    r.calls.length = 0;
    f.hide();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(r.calls).toEqual([]);
    e.stop();
  });

  it("retries with exponential backoff and never loses local data", async () => {
    const s = setAdapter("user_progress", ["mine"]);
    const r = memoryRemote();
    r.failTimes(3);
    const e = new SyncEngine({ remote: r.remote, adapters: [s.adapter], timers, env: fakeEnv().env });
    await e.start();
    expect(e.getStatus()).toMatchObject({ state: "error", retryAt: Date.now() + 2000 });
    expect(s.get()).toEqual(["mine"]);
    await vi.advanceTimersByTimeAsync(1999);
    expect(r.calls.filter((c) => c.startsWith("pull")).length).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(r.calls.filter((c) => c.startsWith("pull")).length).toBe(2);
    expect(e.getStatus().retryAt).toBe(Date.now() + 4000);
    await vi.advanceTimersByTimeAsync(4000);
    expect(e.getStatus().retryAt).toBe(Date.now() + 8000);
    await vi.advanceTimersByTimeAsync(8000);
    expect(e.getStatus().state).toBe("synced");
    expect(r.rows.get("user_progress")?.data).toEqual({ items: ["mine"] });
    expect(s.get()).toEqual(["mine"]);
    e.stop();
  });

  it("goes Offline without retry timers and syncs when back online", async () => {
    const s = setAdapter("user_progress", ["a"]);
    const r = memoryRemote();
    const f = fakeEnv();
    f.goOffline();
    const e = new SyncEngine({ remote: r.remote, adapters: [s.adapter], timers, env: f.env });
    await e.start();
    expect(e.getStatus().state).toBe("offline");
    expect(r.calls).toEqual([]);
    s.add("b");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(r.calls).toEqual([]);
    f.goOnline();
    await vi.advanceTimersByTimeAsync(0);
    expect(e.getStatus().state).toBe("synced");
    expect(r.rows.get("user_progress")?.data).toEqual({ items: ["a", "b"] });
    e.stop();
  });

  it("on a revision conflict, re-pulls and merges the other device's write", async () => {
    const s = setAdapter("user_progress", ["mine"]);
    const r = memoryRemote();
    r.rows.set("user_progress", { data: { items: [] }, rev: 1, schemaVersion: 1 });
    r.conflictTimes(1);
    const e = new SyncEngine({ remote: r.remote, adapters: [s.adapter], timers, env: fakeEnv().env });
    await e.start();
    expect(r.rows.get("user_progress")?.data).toEqual({ items: ["from-other-device", "mine"] });
    expect(s.get()).toEqual(["from-other-device", "mine"]);
    expect(e.getStatus().state).toBe("synced");
    e.stop();
  });

  it("refuses to overwrite a document written by a newer app version", async () => {
    const s = setAdapter("user_progress", ["a"]);
    const r = memoryRemote();
    r.rows.set("user_progress", { data: { items: ["future"] }, rev: 1, schemaVersion: SCHEMA_VERSION + 1 });
    const e = new SyncEngine({ remote: r.remote, adapters: [s.adapter], timers, env: fakeEnv().env });
    await e.start();
    expect(e.getStatus().state).toBe("error");
    expect(e.getStatus().retryAt).toBeUndefined();
    expect(r.rows.get("user_progress")?.data).toEqual({ items: ["future"] });
    expect(s.get()).toEqual(["a"]);
    e.stop();
  });

  it("a call during a running cycle runs one more cycle afterwards (single flight)", async () => {
    const s = setAdapter("user_progress");
    const r = memoryRemote();
    const e = new SyncEngine({ remote: r.remote, adapters: [s.adapter], timers, env: fakeEnv().env });
    const first = e.start();
    void e.syncNow();
    void e.syncNow();
    await first;
    expect(r.calls.filter((c) => c.startsWith("pull")).length).toBe(2);
    e.stop();
  });

  it("stop() cancels pending timers and listeners", async () => {
    const s = setAdapter("user_progress");
    const r = memoryRemote();
    const e = new SyncEngine({ remote: r.remote, adapters: [s.adapter], timers, env: fakeEnv().env });
    await e.start();
    r.calls.length = 0;
    s.add("x");
    e.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(r.calls).toEqual([]);
    expect(e.getStatus().state).toBe("idle");
  });

  it("status listeners see syncing then synced", async () => {
    const s = setAdapter("user_progress");
    const r = memoryRemote();
    const e = new SyncEngine({ remote: r.remote, adapters: [s.adapter], timers, env: fakeEnv().env });
    const seen: string[] = [];
    e.subscribe(() => seen.push(e.getStatus().state));
    await e.start();
    expect(seen).toEqual(["syncing", "synced"]);
    e.stop();
  });
});
