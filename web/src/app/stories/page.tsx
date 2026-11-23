import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { StoryList } from "@/components/stories/StoryList";
import { getStorySummaries } from "@/lib/stories/load";

export const metadata: Metadata = { title: "Stories · BanglaLingo" };

// Prerendered from content/stories/; lock state and "read" badges come from localStorage on the client.
export default function StoriesPage() {
  return (
    <AppShell>
      <StoryList stories={getStorySummaries()} />
    </AppShell>
  );
}
