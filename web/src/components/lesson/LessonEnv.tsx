"use client";

import { createContext, useContext } from "react";
import type { TranslitMap } from "@/lib/translit";

export interface LessonEnv {
  /** Bengali text (NFC) -> transliteration, only what this lesson needs. */
  translit: TranslitMap;
  /** The current exercise belongs to the script (alphabet) track. */
  scriptTrack: boolean;
}

export const LessonEnvContext = createContext<LessonEnv>({ translit: {}, scriptTrack: false });

export function useLessonEnv(): LessonEnv {
  return useContext(LessonEnvContext);
}

/** Transliteration for a Bengali option/tile, or undefined if unknown. */
export function useBnTranslit(bn: string): string | undefined {
  return useContext(LessonEnvContext).translit[bn.normalize("NFC")];
}
