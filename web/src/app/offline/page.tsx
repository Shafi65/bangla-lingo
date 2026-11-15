import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { OfflinePanel } from "@/components/offline/OfflinePanel";
import { getAllLessonIds } from "@/lib/content";
import { getAudioPacks } from "@/lib/offline/server";

export const metadata: Metadata = { title: "Offline · BanglaLingo" };

// Built once from content/ and the shipped audio files; also precached as the offline fallback page.
export default function OfflinePage() {
  const data = getAudioPacks();
  return (
    <AppShell>
      <h1 className="text-3xl font-black">Offline</h1>
      <p className="mt-1 font-semibold text-muted">
        Use BanglaLingo without a connection. Lessons save themselves; audio is up to you.
      </p>
      <div className="mt-6">
        <OfflinePanel data={data} lessonCount={getAllLessonIds().length} />
      </div>
    </AppShell>
  );
}
