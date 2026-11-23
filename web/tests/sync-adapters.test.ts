// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, LocalStorageProgressStore } from "@/lib/progress";
import { featuresAdapter, memoryAdapter, progressAdapter, restamp, settingsAdapter, SYNC_META_KEY } from "@/lib/sync/adapters";
import { SyncEngine, type Remote, type RemoteDoc } from "@/lib/sync/engine";
import { encodeWords } from "@/lib/sync/codec";
import { FORMALITY_KEY, readStore } from "@/lib/formality/storage";
import { readWriteProgress, recordWrite } from "@/lib/write/storage";
import { readSpeakHistory, recordRating } from "@/lib/speak/history";
import { PLACEMENT_KEY, readStoredPlacement } from "@/lib/placement/apply";
import { ONBOARDING_KEY, readOnboarding } from "@/lib/onboarding/storage";
import type { SyncTable } from "@/lib/sync/adapters";

let store: LocalStorageProgressStore;

beforeEach(() => {
  window.localStorage.clear();
  store = new LocalStorageProgressStore();
});

describe("progress adapter", () => {
  it("reads progress without settings and writes back through replaceProgress (one notification)", () => {
    store.completeLesson("u01-l01", 15, 0.9);
    const a = progressAdapter(store);
    const v = a.read();
    expect(v).not.toHaveProperty("settings");
    expect(v.xp).toBe(15);
    const cb = vi.fn();
    const off = a.subscribe(cb);
    a.write({ ...v, xp: 99, completed: { ...v.completed, "u01-l02": { completedAt: "2026-01-01T00:00:00Z", bestAccuracy: 1, timesCompleted: 1 } } });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(store.get().xp).toBe(99);
    expect(Object.keys(store.get().completed)).toEqual(["u01-l01", "u01-l02"]);
    expect(store.get().settings).toEqual(DEFAULT_SETTINGS);
    off();
  });
});

describe("memory adapter", () => {
  it("syncs word records only; pending answers stay on the device", () => {
    const rec = { id: "w1", reps: 1, lapses: 0, stability: 1.5, difficulty: 5, due: 2, lastSeen: 1, run: 1 };
    store.updateWordMemory((m) => ({ ...m, pending: [{ l: "u01-l01", x: { type: "mc" }, ok: true, t: 1 }] }));
    const a = memoryAdapter(store);
    a.write({ w1: rec });
    expect(store.getWordMemory().words).toEqual({ w1: rec });
    expect(store.getWordMemory().pending).toHaveLength(1);
    expect(a.encode(a.read())).toEqual(encodeWords({ w1: rec }));
  });
});

describe("settings adapter", () => {
  it("restamp: keys that differ from the snapshot (or from defaults, without one) get the current time", () => {
    const changed = { ...DEFAULT_SETTINGS, dailyGoal: 30 as const };
    expect(restamp({ snapshot: null, stamps: {} }, changed, 500).stamps).toEqual({ dailyGoal: 500 });
    const m = restamp({ snapshot: changed, stamps: { dailyGoal: 500 } }, { ...changed, sound: false }, 900);
    expect(m.stamps).toEqual({ dailyGoal: 500, sound: 900 });
  });

  it("stamps local changes as they happen and applies merged settings + onboarding", () => {
    let now = 1000;
    const a = settingsAdapter(store, () => now);
    const off = a.subscribe(() => undefined);
    expect(a.read().stamps).toEqual({});
    now = 2000;
    store.updateSettings({ ttsSpeed: "slow" });
    expect(JSON.parse(window.localStorage.getItem(SYNC_META_KEY)!).stamps).toEqual({ ttsSpeed: 2000 });
    a.write({
      settings: { ...DEFAULT_SETTINGS, ttsSpeed: "slow", theme: "dark" },
      stamps: { ttsSpeed: 2000, theme: 1500 },
      onboarding: { version: 1, completed: true, skipped: true },
    });
    expect(store.get().settings.theme).toBe("dark");
    expect(a.read().stamps).toEqual({ ttsSpeed: 2000, theme: 1500 });
    expect(readOnboarding()?.completed).toBe(true);
    off();
  });
});

describe("features adapter", () => {
  it("reads null for untouched features and writes merged ones through each store", () => {
    const a = featuresAdapter();
    expect(a.read()).toEqual({ formality: null, write: null, speak: null, placement: null });
    recordWrite("a", "traced");
    recordRating("k", 2);
    expect(a.read().write).toEqual({ version: 1, letters: { a: "traced" } });
    a.write({
      formality: { v: 1, unlocked: 2, best: { "1": 4 }, rounds: 3 },
      write: { version: 1, letters: { a: "written" } },
      speak: { ...readSpeakHistory(), j: { n: 1, last: 0, at: 5, recent: [0] } },
      placement: { version: 1, takenAt: "2026-01-01T00:00:00Z", accepted: true, route: "core", startLessonId: "u02-l01", levels: {}, answered: 9, background: "none" } as never,
    });
    expect(readStore().unlocked).toBe(2);
    expect(readWriteProgress().letters.a).toBe("written");
    expect(Object.keys(readSpeakHistory()).sort()).toEqual(["j", "k"]);
    expect(readStoredPlacement()?.startLessonId).toBe("u02-l01");
    expect(window.localStorage.getItem(FORMALITY_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(PLACEMENT_KEY)).not.toBeNull();
  });
});

describe("engine + real adapters: two devices converge", () => {
  it("device B signs in and gets A's lessons, words, settings and intro; and the server gets B's", async () => {
    const rows = new Map<SyncTable, RemoteDoc>();
    const remote: Remote = {
      pull: async (t) => (rows.has(t) ? structuredClone(rows.get(t)!) : null),
      push: async (t, data, schemaVersion, prevRev) => {
        if ((rows.get(t)?.rev ?? null) !== prevRev) return "conflict";
        rows.set(t, { data: structuredClone(data), rev: (prevRev ?? 0) + 1, schemaVersion });
        return "ok";
      },
    };
    const env = { online: () => true, onOnline: () => () => undefined, onHidden: () => () => undefined };

    // Device A
    store.completeLesson("u01-l01", 15, 1);
    store.updateSettings({ dailyGoal: 50 });
    window.localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ version: 1, completed: true, skipped: false }));
    const engineA = new SyncEngine({ remote, adapters: [progressAdapter(store), memoryAdapter(store), settingsAdapter(store), featuresAdapter()], env });
    await engineA.start();
    engineA.stop();
    expect(rows.size).toBe(4);

    // Device B: a fresh browser that played a different lesson.
    window.localStorage.clear();
    const storeB = new LocalStorageProgressStore();
    storeB.completeLesson("u01-l02", 10, 0.7);
    const engineB = new SyncEngine({ remote, adapters: [progressAdapter(storeB), memoryAdapter(storeB), settingsAdapter(storeB), featuresAdapter()], env });
    await engineB.start();
    expect(engineB.getStatus().state).toBe("synced");
    engineB.stop();
    const b = storeB.get();
    expect(Object.keys(b.completed).sort()).toEqual(["u01-l01", "u01-l02"]);
    expect(b.xp).toBe(15);
    expect(b.settings.dailyGoal).toBe(50);
    expect(readOnboarding()?.completed).toBe(true);
    // ... and the server now has both lessons for device A's next sync.
    expect(Object.keys((rows.get("user_progress")!.data as { completed: object }).completed).sort()).toEqual(["u01-l01", "u01-l02"]);
  });
});
