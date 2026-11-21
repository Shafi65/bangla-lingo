import type { Metadata } from "next";
import { SpeakPractice } from "@/components/speak/SpeakPractice";
import { getSpeakData } from "@/lib/speak/data";

export const metadata: Metadata = {
  title: "Speaking practice · BanglaLingo",
  description: "Shadow native clips: listen, record yourself and compare the waveforms.",
};

// Prerendered: the clipped sentences are read from content/ at build time; the sets are chosen on the device.
export default function SpeakPage() {
  return <SpeakPractice data={getSpeakData()} />;
}
