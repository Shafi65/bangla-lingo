"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useProgress } from "@/lib/progress";
import { useThemeSync } from "@/lib/ui/theme";

const ScriptLessonsContext = createContext<readonly string[]>([]);

/** Makes course-wide facts (currently: the script lesson ids) available to client UI. */
export function CourseProvider({
  scriptLessonIds,
  children,
}: {
  scriptLessonIds: string[];
  children: ReactNode;
}) {
  useThemeSync();
  return (
    <ScriptLessonsContext.Provider value={scriptLessonIds}>
      {children}
    </ScriptLessonsContext.Provider>
  );
}

/**
 * How transliteration should appear right now:
 * - "show": always visible
 * - "faded": visible but quieter (learner has started the script track)
 * - "reveal": hidden behind a tap (setting "hidden", or every script lesson done)
 */
export type TranslitVisibility = "show" | "faded" | "reveal";

export function useTranslitVisibility(): TranslitVisibility {
  const { settings, completed } = useProgress();
  const scriptIds = useContext(ScriptLessonsContext);
  if (settings.translit === "always") return "show";
  if (settings.translit === "hidden") return "reveal";
  if (scriptIds.length === 0) return "show";
  const done = scriptIds.filter((id) => completed[id]).length;
  if (done === 0) return "show";
  return done >= scriptIds.length ? "reveal" : "faded";
}

/** True if this lesson id (or a practice exercise id "<lessonId>:<n>") is in the script track. */
export function useIsScriptLesson(id: string): boolean {
  const scriptIds = useContext(ScriptLessonsContext);
  const lessonId = id.includes(":") ? id.slice(0, id.indexOf(":")) : id;
  return scriptIds.includes(lessonId);
}
