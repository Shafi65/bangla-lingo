import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckpointLesson } from "@/components/lesson/CheckpointLesson";
import { LessonPlayer } from "@/components/lesson/LessonPlayer";
import { testOutInfo } from "@/lib/checkpoint";
import { getAllLessonIds, getCourse, getLesson } from "@/lib/content";
import { translitFor } from "@/lib/translit";

// Every lesson is prerendered at build time from content/ (or the fixture).
export function generateStaticParams() {
  return getAllLessonIds().map((id) => ({ id }));
}

export async function generateMetadata({
  params,
}: PageProps<"/lesson/[id]">): Promise<Metadata> {
  const { id } = await params;
  const lesson = getLesson(id);
  return { title: lesson ? `${lesson.title} · BanglaLingo` : "Lesson not found" };
}

export default async function LessonPage({ params }: PageProps<"/lesson/[id]">) {
  const { id } = await params;
  const lesson = getLesson(id);
  if (!lesson) notFound();
  const translit = translitFor(lesson.exercises);
  // A main-track checkpoint can also be started as a test-out (?mode=testout).
  const testOut = testOutInfo(getCourse(), id);
  if (testOut) return <CheckpointLesson lesson={lesson} translit={translit} testOut={testOut} />;
  return <LessonPlayer lesson={lesson} translit={translit} />;
}
