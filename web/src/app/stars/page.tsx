import type { Metadata } from "next";
import { NightSky } from "@/components/stars/NightSky";
import { getCourse, getLesson } from "@/lib/content";
import { getReviewWords, getWordIndex } from "@/lib/review/catalog";
import { buildWriteGroups } from "@/lib/write/letters";

export const metadata: Metadata = { title: "The letter sky · BanglaLingo" };

export default function StarsPage() {
  const units = getCourse().units.filter((u) => u.track === "script");
  const groups = buildWriteGroups(
    units.map((u) => ({ id: u.id, title: u.title, lessons: u.lessons.map((l) => l.id) })),
    getLesson,
  );
  return <NightSky groups={groups} words={getReviewWords()} index={getWordIndex()} />;
}
