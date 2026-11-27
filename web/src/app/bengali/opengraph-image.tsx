import { CARD_SIZE, wordCard } from "@/lib/og/word-card";

export const size = CARD_SIZE;
export const contentType = "image/png";
export const alt = "Bengali words and phrases, with pronunciation and meaning";

export default function Image() {
  return wordCard({ bn: "বাংলা", tr: "bangla", en: "Bengali", kicker: "Everyday Bengali words and phrases" });
}
