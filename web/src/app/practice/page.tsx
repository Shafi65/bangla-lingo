import type { Metadata } from "next";
import { PracticeHub, type PracticePoolLesson } from "@/components/PracticeHub";
import { getAllLessons } from "@/lib/content";
import { translitFor } from "@/lib/translit";

export const metadata: Metadata = { title: "Practice · BanglaLingo" };

export default function PracticePage() {
  const pool: PracticePoolLesson[] = getAllLessons().map((l) => ({
    id: l.id,
    title: l.title,
    exercises: l.exercises,
  }));
  const translit = translitFor(getAllLessons().flatMap((l) => l.exercises));
  return <PracticeHub pool={pool} translit={translit} />;
}
