import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LessonReview } from "@/components/reviewer/LessonReview";
import { getAllLessonIds, getLesson } from "@/lib/content";
import { getLessonReviewData } from "@/lib/reviewer/data";
import { REVIEWER_ROBOTS } from "@/lib/reviewer/robots";

export function generateStaticParams() {
  return getAllLessonIds().map((lessonId) => ({ lessonId }));
}

export async function generateMetadata({ params }: PageProps<"/reviewer/[lessonId]">): Promise<Metadata> {
  const { lessonId } = await params;
  const lesson = getLesson(lessonId);
  return { title: lesson ? `Review: ${lesson.title} · BanglaLingo` : "Lesson not found", robots: REVIEWER_ROBOTS };
}

export default async function ReviewLessonPage({ params }: PageProps<"/reviewer/[lessonId]">) {
  const { lessonId } = await params;
  const data = getLessonReviewData(lessonId);
  if (!data) notFound();
  return <LessonReview {...data} />;
}
