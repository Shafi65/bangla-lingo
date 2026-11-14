// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, LocalStorageProgressStore, progressStore, sanitizeSettings } from "@/lib/progress";
import { setThemePref } from "@/lib/ui/theme";
import { THEME_KEY, THEME_SCRIPT } from "@/lib/ui/theme-script";

const KEY = "banglalingo.progress.v1";
const blob = (settings: unknown) => JSON.stringify({ version: 1, xp: 5, streak: 0, lastActiveDate: null, completed: {}, daily: {}, settings });

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themePref;
});

describe("theme setting", () => {
  it("defaults to system", () => {
    expect(DEFAULT_SETTINGS.theme).toBe("system");
    expect(new LocalStorageProgressStore().get().settings.theme).toBe("system");
  });

  it("sanitises unknown values to the default and keeps valid ones", () => {
    expect(sanitizeSettings({ theme: "dark" }).theme).toBe("dark");
    expect(sanitizeSettings({ theme: "light" }).theme).toBe("light");
    for (const bad of ["blue", "", 3, null, undefined, {}]) expect(sanitizeSettings({ theme: bad }).theme).toBe("system");
    expect(sanitizeSettings(undefined).theme).toBe("system");
    window.localStorage.setItem(KEY, blob({ theme: "neon" }));
    expect(new LocalStorageProgressStore().get().settings.theme).toBe("system");
  });

  it("updateSettings stores it and rejects junk", () => {
    const s = new LocalStorageProgressStore();
    expect(s.updateSettings({ theme: "dark" }).settings.theme).toBe("dark");
    expect(JSON.parse(window.localStorage.getItem(KEY)!).settings.theme).toBe("dark");
    expect(s.updateSettings({ theme: "nope" as never }).settings.theme).toBe("system");
  });

  it("mirrors light/dark into the pre-paint key and clears it for system", () => {
    const s = new LocalStorageProgressStore();
    s.updateSettings({ theme: "dark" });
    expect(window.localStorage.getItem(THEME_KEY)).toBe("dark");
    s.updateSettings({ theme: "system" });
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull();
    expect(THEME_SCRIPT).toContain(THEME_KEY);
  });

  it("keeps other settings when the theme changes", () => {
    const s = new LocalStorageProgressStore();
    s.updateSettings({ dailyGoal: 30, sound: false });
    expect(s.updateSettings({ theme: "light" }).settings).toMatchObject({ dailyGoal: 30, sound: false, theme: "light" });
  });

  it("reset keeps the theme (and its mirror)", () => {
    const s = new LocalStorageProgressStore();
    s.updateSettings({ theme: "dark" });
    s.recordPractice(10);
    s.reset();
    expect(s.get().xp).toBe(0);
    expect(s.get().settings.theme).toBe("dark");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("dark");
  });

  it("setThemePref updates the store and <html>", () => {
    setThemePref("dark");
    expect(progressStore.get().settings.theme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.themePref).toBe("dark");
    setThemePref("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});

describe("theme migration from the old key", () => {
  it("adopts a legacy value when settings predate the theme field", () => {
    window.localStorage.setItem(KEY, blob({ translit: "always", sound: true, ttsSpeed: "normal", dailyGoal: 20 }));
    window.localStorage.setItem(THEME_KEY, "dark");
    const s = new LocalStorageProgressStore();
    expect(s.get().settings.theme).toBe("dark");
    expect(s.get().xp).toBe(5);
    expect(s.get()).toBe(s.get()); // stable snapshot
  });

  it("adopts a legacy value when there is no progress blob at all", () => {
    window.localStorage.setItem(THEME_KEY, "light");
    expect(new LocalStorageProgressStore().get().settings.theme).toBe("light");
  });

  it("is persisted into settings by the next write, after which settings win", () => {
    window.localStorage.setItem(THEME_KEY, "dark");
    const s = new LocalStorageProgressStore();
    s.recordPractice(1);
    expect(JSON.parse(window.localStorage.getItem(KEY)!).settings.theme).toBe("dark");
    s.updateSettings({ theme: "system" }); // explicit choice beats any stale legacy value
    window.localStorage.setItem(THEME_KEY, "dark");
    expect(new LocalStorageProgressStore().get().settings.theme).toBe("system");
  });

  it("ignores junk in the legacy key", () => {
    window.localStorage.setItem(THEME_KEY, "purple");
    expect(new LocalStorageProgressStore().get().settings.theme).toBe("system");
  });
});
