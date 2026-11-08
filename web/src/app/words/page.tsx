import type { Metadata } from "next";
import { WordList, type WordGroup } from "@/components/WordList";
import { getCourse, getLesson } from "@/lib/content";

export const metadata: Metadata = { title: "My words · BanglaLingo" };

export default function WordsPage() {
  const groups: WordGroup[] = getCourse().units.flatMap((unit) =>
    unit.lessons.map((l) => ({
      lessonId: l.id,
      lessonTitle: l.title,
      unitTitle: unit.title,
      words: getLesson(l.id)?.vocab ?? [],
    })),
  );
  return <WordList groups={groups.filter((g) => g.words.length > 0)} />;
}
