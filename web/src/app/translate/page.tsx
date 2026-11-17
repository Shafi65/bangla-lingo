import type { Metadata } from "next";
import { Translate } from "@/components/translate/Translate";
import { getTranslateData } from "@/lib/translate/data";

export const metadata: Metadata = {
  title: "Translate · BanglaLingo",
  description: "Look up English, Bengali or romanized Bengali in the course's words and sentences.",
};

// Prerendered: the course index is built from content/ at build time and searched on the device.
export default function TranslatePage() {
  return <Translate data={getTranslateData()} />;
}
