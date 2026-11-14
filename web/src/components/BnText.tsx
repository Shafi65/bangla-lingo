import type { BnText as BnTextT } from "@/lib/types";
import { SpeakButton } from "./SpeakButton";
import { Translit } from "./Translit";

/** Bengali script + transliteration (+ optional English), with a speaker. */
export function BnText({
  text,
  showEn = false,
  speaker = true,
  size = "md",
}: {
  text: Pick<BnTextT, "bn" | "tr"> & { en?: string };
  showEn?: boolean;
  speaker?: boolean;
  size?: "md" | "lg";
}) {
  return (
    <div className="flex items-center gap-3">
      {speaker && <SpeakButton bn={text.bn} size={size === "lg" ? "md" : "sm"} />}
      <div className="min-w-0">
        <div
          lang="bn"
          className={`font-bold text-pretty text-ink [overflow-wrap:anywhere] ${size === "lg" ? "text-3xl" : "text-xl"}`}
        >
          {text.bn}
        </div>
        <div className="text-sm font-semibold">
          <Translit tr={text.tr} />
        </div>
        {showEn && text.en && (
          <div className="text-sm font-semibold text-pretty text-ink/80">{text.en}</div>
        )}
      </div>
    </div>
  );
}
