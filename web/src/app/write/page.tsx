import type { Metadata } from "next";
import { WriteApp } from "@/components/write/WriteApp";
import { getCourse, getLesson } from "@/lib/content";
import { buildWriteGroups } from "@/lib/write/letters";

export const metadata: Metadata = { title: "Write the letters · BanglaLingo" };

export default function WritePage() {
  const units = getCourse().units.filter((u) => u.track === "script");
  const groups = buildWriteGroups(
    units.map((u) => ({ id: u.id, title: u.title, lessons: u.lessons.map((l) => l.id) })),
    getLesson,
  );
  return <WriteApp groups={groups} />;
}
