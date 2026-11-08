import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LessonPlayer } from "@/components/lesson/LessonPlayer";
import { getAllLessonIds, getLesson } from "@/lib/content";

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
  return <LessonPlayer lesson={lesson} />;
}
