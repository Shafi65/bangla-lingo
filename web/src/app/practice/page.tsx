import type { Metadata } from "next";
import { PracticeHub } from "@/components/PracticeHub";
import { getReviewWords, getWordIndex } from "@/lib/review/catalog";

export const metadata: Metadata = { title: "Practice · BanglaLingo" };

export default function PracticePage() {
  return <PracticeHub words={getReviewWords()} index={getWordIndex()} />;
}
