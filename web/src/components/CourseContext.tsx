"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useProgress } from "@/lib/progress";
import { resolveTranslitVisibility, type TranslitVisibility } from "@/lib/translitVisibility";
import { useThemeSync } from "@/lib/ui/theme";

const ScriptLessonsContext = createContext<readonly string[]>([]);

/** True inside a lesson marked `scriptOnly` (see Lesson.scriptOnly): transliteration is hidden until tapped. */
export const ScriptOnlyContext = createContext(false);

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

export type { TranslitVisibility };

export function useTranslitVisibility(): TranslitVisibility {
  const { settings, completed } = useProgress();
  const scriptIds = useContext(ScriptLessonsContext);
  const scriptOnly = useContext(ScriptOnlyContext);
  return resolveTranslitVisibility(settings, scriptIds, completed, scriptOnly);
}

/** True if this lesson id (or a practice exercise id "<lessonId>:<n>") is in the script track. */
export function useIsScriptLesson(id: string): boolean {
  const scriptIds = useContext(ScriptLessonsContext);
  const lessonId = id.includes(":") ? id.slice(0, id.indexOf(":")) : id;
  return scriptIds.includes(lessonId);
}
