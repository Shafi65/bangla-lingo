import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StoryPlayer } from "@/components/stories/StoryPlayer";
import { getStories, getStory, getStorySummaries } from "@/lib/stories/load";

// Every story is prerendered at build time from content/stories/.
// Cache Components needs at least one param, so a content set without stories (the demo fixture)
// prerenders a placeholder that resolves to "not found".
export function generateStaticParams() {
  const ids = getStories().map((s) => ({ id: s.id }));
  return ids.length ? ids : [{ id: "none" }];
}

export async function generateMetadata({ params }: PageProps<"/stories/[id]">): Promise<Metadata> {
  const { id } = await params;
  const story = getStory(id);
  return { title: story ? `${story.title.en} · Stories · BanglaLingo` : "Story not found" };
}

export default async function StoryPage({ params }: PageProps<"/stories/[id]">) {
  const { id } = await params;
  const story = getStory(id);
  if (!story) notFound();
  const all = getStorySummaries();
  const next = all[all.findIndex((s) => s.id === id) + 1];
  return <StoryPlayer story={story} next={next} />;
}
