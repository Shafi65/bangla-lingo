import type { Metadata } from "next";
import { WordList } from "@/components/WordList";
import { getReviewWords, getWordIndex } from "@/lib/review/catalog";

export const metadata: Metadata = { title: "My words · BanglaLingo" };

export default function WordsPage() {
  return <WordList words={getReviewWords()} index={getWordIndex()} />;
}
