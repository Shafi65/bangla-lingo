"use client";
// Appearance preference (Light / Dark / System).
//
// The preference is `settings.theme` in the progress store (lib/progress.ts),
// the single source of truth. The store also mirrors light/dark into the small
// localStorage key THEME_KEY (and clears it for "system"), because the inline
// script in app/layout.tsx (THEME_SCRIPT) must read it before first paint,
// before any JS has loaded. The script resolves "system" via matchMedia, so
// <html data-theme> is always "light" or "dark".
import { useEffect } from "react";
import { progressStore, useProgress, type ThemePref } from "../progress";
import { THEME_KEY } from "./theme-script";

export type { ThemePref };
export { THEME_KEY };

export function applyTheme(pref: ThemePref): void {
  const dark =
    pref === "dark" ||
    (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.themePref = pref;
}

export function setThemePref(pref: ThemePref): void {
  progressStore.updateSettings({ theme: pref });
  applyTheme(pref);
}

/** Saved preference; "system" during SSR and first hydration. */
export function useThemePref(): ThemePref {
  return useProgress().settings.theme;
}

/**
 * Applies theme changes made elsewhere (another tab, a reset). Mounted once in
 * the root layout. Does nothing on first render: the pre-paint script already
 * set the right theme, and re-applying the server snapshot would flash.
 */
export function useThemeSync(): void {
  useEffect(
    () =>
      progressStore.subscribe(() => {
        const pref = progressStore.get().settings.theme;
        if (document.documentElement.dataset.themePref !== pref) applyTheme(pref);
      }),
    [],
  );
}
