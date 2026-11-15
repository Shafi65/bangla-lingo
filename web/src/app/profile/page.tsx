import type { Metadata } from "next";
import { ProfileView } from "@/components/profile/ProfileView";
import { getCourse } from "@/lib/content";
import { getReviewWords, getWordIndex } from "@/lib/review/catalog";

export const metadata: Metadata = { title: "Your progress · BanglaLingo" };

export default function ProfilePage() {
  return <ProfileView words={getReviewWords()} index={getWordIndex()} course={getCourse()} />;
}
