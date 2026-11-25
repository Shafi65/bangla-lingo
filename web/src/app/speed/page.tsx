import type { Metadata } from "next";
import { SpeedRound } from "@/components/game/SpeedRound";
import { getReviewWords, getWordIndex } from "@/lib/review/catalog";

export const metadata: Metadata = { title: "Speed round · BanglaLingo" };

export default function SpeedPage() {
  return <SpeedRound words={getReviewWords()} index={getWordIndex()} />;
}
