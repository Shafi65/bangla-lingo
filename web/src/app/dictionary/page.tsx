import type { Metadata } from "next";
import { Dictionary } from "@/components/dictionary/Dictionary";
import { getDictionary } from "@/lib/dictionary/data";

export const metadata: Metadata = {
  title: "Dictionary · BanglaLingo",
  description: "Search every Bengali word and letter in the course.",
};

export default function DictionaryPage() {
  return <Dictionary data={getDictionary()} />;
}
