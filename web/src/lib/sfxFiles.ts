// The shipped sound-effect files (made by scripts/gen-sfx.mjs). Plain data, safe to import anywhere.
export type Sfx = "correct" | "wrong" | "complete" | "combo" | "streak" | "coin" | "chest" | "freeze" | "tap";

export const SFX_FILES: readonly Sfx[] = ["correct", "wrong", "complete", "combo", "streak", "coin", "chest", "freeze", "tap"];
export const sfxUrl = (s: Sfx) => `/sfx/${s}.mp3`;
