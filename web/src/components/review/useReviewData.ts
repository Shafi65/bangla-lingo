"use client";

import { useEffect, useMemo } from "react";
import { provideWordIndex } from "@/lib/memory";
import { useProgress, useWordMemory } from "@/lib/progress";
import { useNow } from "@/lib/review";
import type { WordIndex } from "@/lib/review/targets";
import type { ReviewWord } from "@/lib/review/types";

/**
 * Shared state for the practice and word-list screens: hands the word index to
 * lib/memory (replays pending answers, seeds old progress) and works out which
 * words the learner has met. `now` is 0 until the client has mounted.
 */
export function useReviewData(words: readonly ReviewWord[], index: WordIndex) {
  const progress = useProgress();
  const memory = useWordMemory();
  const now = useNow();

  useEffect(() => {
    provideWordIndex(index);
  }, [index, progress.completed, memory.pending.length]);

  const learned = useMemo(() => {
    const s = new Set<string>();
    for (const w of words) if (memory.words[w.id] || progress.completed[w.lesson]) s.add(w.id);
    return s;
  }, [words, memory.words, progress.completed]);

  return { progress, memory, now, learned };
}
