"use client";
// Appearance preference (Light / Dark / System).
//
// The progress store's Settings shape (lib/progress.ts) has no theme field and
// sanitises unknown keys away, so the preference lives under its own guarded
// localStorage key. The inline script in app/layout.tsx (THEME_SCRIPT) reads
// the same key before first paint and resolves "system" via matchMedia, so
// <html data-theme> is always "light" or "dark".
import { useSyncExternalStore } from "react";

export type ThemePref = "light" | "dark" | "system";
import { THEME_KEY } from "./theme-script";
export { THEME_KEY };
const EVENT = "banglalingo:theme";

function readPref(): ThemePref {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

let memoryPref: ThemePref | null = null;

function current(): ThemePref {
  return memoryPref ?? readPref();
}

export function applyTheme(pref: ThemePref): void {
  const dark =
    pref === "dark" ||
    (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.themePref = pref;
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === "system") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, pref);
    memoryPref = null;
  } catch {
    memoryPref = pref; // storage disabled: remember for this tab only
  }
  applyTheme(pref);
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY) {
      applyTheme(current());
      cb();
    }
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Saved preference; "system" during SSR and first hydration. */
export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, current, () => "system");
}

