import { CARD_SIZE, wordCard } from "@/lib/og/word-card";
import { getWordPage, wordPageParams, primaryEnglish } from "@/lib/wordpages/data";

export const size = CARD_SIZE;
export const contentType = "image/png";
export const alt = "A Bengali word with its pronunciation and meaning";

export function generateStaticParams() {
  return wordPageParams();
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = getWordPage(slug);
  return wordCard(
    p
      ? { bn: p.bn, tr: p.tr, en: primaryEnglish(p.en), kicker: "How to say it in Bengali" }
      : { bn: "বাংলা", tr: "bangla", en: "Bengali", kicker: "Learn Bengali" },
  );
}
